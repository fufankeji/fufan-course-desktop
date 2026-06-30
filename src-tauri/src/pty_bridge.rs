use std::{
    env,
    fs,
    io::{self, Read, Write},
    path::PathBuf,
    process,
    sync::mpsc,
    thread,
    time::{Duration, SystemTime},
};

use anyhow::{anyhow, Context, Result};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct ResizePayload {
    cols: Option<u16>,
    rows: Option<u16>,
}

fn main() {
    match run() {
        Ok(code) => process::exit(code),
        Err(error) => {
            eprintln!("{error:#}");
            process::exit(1);
        }
    }
}

fn run() -> Result<i32> {
    let mut args = env::args().skip(1);
    let command = args.next().ok_or_else(|| {
        anyhow!("Usage: fufan-pty-bridge <command> [cols] [rows] [resize-control-file]")
    })?;
    let cols = parse_size(args.next(), 100);
    let rows = parse_size(args.next(), 30);
    let resize_control_file = args.next().map(PathBuf::from);
    let child_args: Vec<String> = args.collect();

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .context("open PTY")?;

    let mut command_builder = CommandBuilder::new(command);
    command_builder.args(child_args);
    if let Ok(cwd) = env::current_dir() {
        command_builder.cwd(cwd);
    }
    for (key, value) in env::vars() {
        command_builder.env(key, value);
    }
    command_builder.env("TERM", env::var("TERM").unwrap_or_else(|_| "xterm-256color".to_string()));

    let mut child = pair
        .slave
        .spawn_command(command_builder)
        .context("spawn command in PTY")?;
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().context("clone PTY reader")?;
    let mut writer = pair.master.take_writer().context("take PTY writer")?;

    thread::spawn(move || {
        let mut stdout = io::stdout().lock();
        let mut buffer = [0_u8; 8192];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(count) => {
                    if stdout.write_all(&buffer[..count]).is_err() {
                        break;
                    }
                    let _ = stdout.flush();
                }
                Err(_) => break,
            }
        }
    });

    thread::spawn(move || {
        let mut stdin = io::stdin().lock();
        let mut buffer = [0_u8; 8192];
        loop {
            match stdin.read(&mut buffer) {
                Ok(0) => break,
                Ok(count) => {
                    if writer.write_all(&buffer[..count]).is_err() {
                        break;
                    }
                    let _ = writer.flush();
                }
                Err(_) => break,
            }
        }
    });

    let (exit_tx, exit_rx) = mpsc::channel();
    thread::spawn(move || {
        let result = child.wait();
        let _ = exit_tx.send(result);
    });

    let mut last_resize_mtime: Option<SystemTime> = None;
    loop {
        if let Ok(status) = exit_rx.try_recv() {
            let status = status.context("wait for child process")?;
            return Ok(status.exit_code() as i32);
        }

        if let Some(path) = resize_control_file.as_ref() {
            if let Ok(metadata) = fs::metadata(path) {
                let modified = metadata.modified().ok();
                if modified.is_some() && modified != last_resize_mtime {
                    last_resize_mtime = modified;
                    if let Ok(payload) = read_resize_payload(path) {
                        let _ = pair.master.resize(PtySize {
                            rows: payload.rows.unwrap_or(rows).max(1),
                            cols: payload.cols.unwrap_or(cols).max(1),
                            pixel_width: 0,
                            pixel_height: 0,
                        });
                    }
                }
            }
        }

        thread::sleep(Duration::from_millis(80));
    }
}

fn parse_size(value: Option<String>, default: u16) -> u16 {
    value
        .and_then(|text| text.parse::<u16>().ok())
        .filter(|number| *number > 0)
        .unwrap_or(default)
}

fn read_resize_payload(path: &PathBuf) -> Result<ResizePayload> {
    let text = fs::read_to_string(path).context("read resize control file")?;
    serde_json::from_str(&text).context("parse resize control file")
}
