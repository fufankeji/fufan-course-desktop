#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;

#[cfg(not(debug_assertions))]
use std::{
    error::Error,
    fs, io,
    net::TcpStream,
    path::Path,
    thread,
    time::{Duration, Instant},
};

#[cfg(not(debug_assertions))]
use tauri::path::BaseDirectory;
use tauri::Manager;
use tauri_plugin_shell::process::CommandChild;
#[cfg(not(debug_assertions))]
use tauri_plugin_shell::ShellExt;

#[cfg(not(debug_assertions))]
const BACKEND_HOST: &str = "127.0.0.1";
#[cfg(not(debug_assertions))]
const BACKEND_PORT: u16 = 5178;
const BACKEND_URL: &str = "http://127.0.0.1:5178";

struct BackendProcess(Mutex<Option<CommandChild>>);

#[tauri::command]
fn backend_url() -> &'static str {
    BACKEND_URL
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(BackendProcess(Mutex::new(None)))
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                let _ = &app.state::<BackendProcess>().0;
            }

            #[cfg(not(debug_assertions))]
            {
                prepare_packaged_runtime(app.handle())?;
                let child = start_packaged_backend(app.handle())?;
                app.state::<BackendProcess>()
                    .0
                    .lock()
                    .expect("backend process state lock poisoned")
                    .replace(child);
                wait_for_backend(Duration::from_secs(12))?;
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![backend_url])
        .run(tauri::generate_context!())
        .expect("failed to run FuFan course desktop app");
}

#[cfg(not(debug_assertions))]
fn prepare_packaged_runtime(app: &tauri::AppHandle) -> Result<(), Box<dyn Error>> {
    let resource_backend = app
        .path()
        .resolve("resources/backend", BaseDirectory::Resource)?;
    let resource_frontend = app
        .path()
        .resolve("resources/frontend", BaseDirectory::Resource)?;
    let app_data = app.path().app_local_data_dir()?;

    fs::create_dir_all(&app_data)?;
    let backend_target = app_data.join("backend");
    let frontend_target = app_data.join("frontend");

    refresh_directory(&resource_frontend, &frontend_target)?;
    refresh_directory(
        &resource_backend.join("server"),
        &backend_target.join("server"),
    )?;
    refresh_directory(
        &resource_backend.join("runtime-packs"),
        &backend_target.join("runtime-packs"),
    )?;
    refresh_directory(
        &resource_backend.join("runtime"),
        &backend_target.join("runtime"),
    )?;

    let knowledge_target = backend_target.join("knowledge");
    if !knowledge_target.exists() {
        copy_directory(&resource_backend.join("knowledge"), &knowledge_target)?;
    }

    fs::create_dir_all(backend_target.join("data"))?;
    Ok(())
}

#[cfg(not(debug_assertions))]
fn start_packaged_backend(app: &tauri::AppHandle) -> Result<CommandChild, Box<dyn Error>> {
    let app_data = app.path().app_local_data_dir()?;
    let backend_entry = app_data.join("backend").join("server").join("index.js");
    let backend_dir = app_data.join("backend");

    let (mut rx, child) = app
        .shell()
        .sidecar("binaries/fufan-node")?
        .args([backend_entry.to_string_lossy().to_string()])
        .current_dir(backend_dir)
        .env("HOST", BACKEND_HOST)
        .env("PORT", BACKEND_PORT.to_string())
        .spawn()?;

    tauri::async_runtime::spawn(async move {
        while rx.recv().await.is_some() {}
    });

    Ok(child)
}

#[cfg(not(debug_assertions))]
fn wait_for_backend(timeout: Duration) -> Result<(), Box<dyn Error>> {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if TcpStream::connect((BACKEND_HOST, BACKEND_PORT)).is_ok() {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(250));
    }
    Err(format!("backend did not start at {BACKEND_URL} within {timeout:?}").into())
}

#[cfg(not(debug_assertions))]
fn refresh_directory(source: &Path, target: &Path) -> io::Result<()> {
    if target.exists() {
        fs::remove_dir_all(target)?;
    }
    copy_directory(source, target)
}

#[cfg(not(debug_assertions))]
fn copy_directory(source: &Path, target: &Path) -> io::Result<()> {
    fs::create_dir_all(target)?;

    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let source_path = entry.path();
        let target_path = target.join(entry.file_name());
        let file_type = entry.file_type()?;

        if file_type.is_dir() {
            copy_directory(&source_path, &target_path)?;
        } else {
            fs::copy(&source_path, &target_path)?;
            if let Ok(metadata) = fs::metadata(&source_path) {
                let _ = fs::set_permissions(&target_path, metadata.permissions());
            }
        }
    }

    Ok(())
}
