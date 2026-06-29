const ESC = "\x1b";
const BEL = "\x07";

export function createTerminalScreen(options = {}) {
  return new TerminalScreen(options);
}

class TerminalScreen {
  constructor({ cols = 100, rows = 30 } = {}) {
    this.cols = Math.max(1, cols);
    this.rows = Math.max(1, rows);
    this.saved = { row: 0, col: 0 };
    this.pending = "";
    this.clear();
  }

  clear() {
    this.buffer = Array.from({ length: this.rows }, () => blankLine(this.cols));
    this.row = 0;
    this.col = 0;
  }

  write(value) {
    const text = `${this.pending}${String(value || "")}`;
    this.pending = "";
    let index = 0;
    while (index < text.length) {
      const char = text[index];
      if (char === ESC) {
        index = this.consumeEscape(text, index);
        continue;
      }
      if (char === "\r") {
        this.col = 0;
      } else if (char === "\n") {
        this.newLine();
      } else if (char === "\b") {
        this.col = Math.max(0, this.col - 1);
      } else if (char === "\t") {
        this.col = Math.min(this.cols - 1, this.col + (4 - (this.col % 4)));
      } else if (char >= " ") {
        this.putChar(char);
      }
      index += 1;
    }
  }

  toString() {
    return this.buffer.map((line) => line.join("").trimEnd()).join("\n");
  }

  consumeEscape(text, start) {
    const next = text[start + 1];
    if (!next) {
      this.pending = text.slice(start);
      return text.length;
    }

    if (next === "[") {
      let end = start + 2;
      while (end < text.length && !isCsiFinal(text[end])) end += 1;
      if (end >= text.length) {
        this.pending = text.slice(start);
        return text.length;
      }
      this.handleCsi(text.slice(start + 2, end), text[end]);
      return end + 1;
    }

    if (next === "]") {
      let end = start + 2;
      while (end < text.length) {
        if (text[end] === BEL) return end + 1;
        if (text[end] === ESC && text[end + 1] === "\\") return end + 2;
        end += 1;
      }
      this.pending = text.slice(start);
      return text.length;
    }

    if (next === "M") {
      this.row = Math.max(0, this.row - 1);
      return start + 2;
    }

    return start + 2;
  }

  handleCsi(rawParams, final) {
    const privateMode = rawParams.includes("?");
    const params = parseParams(rawParams);
    const first = params[0] ?? 0;

    if ((final === "h" || final === "l") && privateMode && rawParams.includes("1049")) {
      this.clear();
      return;
    }

    if (final === "H" || final === "f") {
      this.row = clamp((params[0] || 1) - 1, 0, this.rows - 1);
      this.col = clamp((params[1] || 1) - 1, 0, this.cols - 1);
      return;
    }

    if (final === "J") {
      if (first === 2 || first === 3) {
        this.clear();
      } else if (first === 1) {
        for (let row = 0; row <= this.row; row += 1) {
          const end = row === this.row ? this.col + 1 : this.cols;
          this.buffer[row].fill(" ", 0, end);
        }
      } else {
        for (let row = this.row; row < this.rows; row += 1) {
          const start = row === this.row ? this.col : 0;
          this.buffer[row].fill(" ", start);
        }
      }
      return;
    }

    if (final === "K") {
      if (first === 1) this.buffer[this.row].fill(" ", 0, this.col + 1);
      else if (first === 2) this.buffer[this.row].fill(" ");
      else this.buffer[this.row].fill(" ", this.col);
      return;
    }

    if (final === "X") {
      const count = first || 1;
      this.buffer[this.row].fill(" ", this.col, clamp(this.col + count, 0, this.cols));
      return;
    }

    if (final === "P") {
      const count = first || 1;
      for (let col = this.col; col < this.cols; col += 1) {
        this.buffer[this.row][col] = this.buffer[this.row][col + count] || " ";
      }
      return;
    }

    if (final === "@") {
      const count = first || 1;
      for (let col = this.cols - 1; col >= this.col; col -= 1) {
        this.buffer[this.row][col] = col - count >= this.col ? this.buffer[this.row][col - count] : " ";
      }
      return;
    }

    if (final === "A") this.row = clamp(this.row - (first || 1), 0, this.rows - 1);
    if (final === "B") this.row = clamp(this.row + (first || 1), 0, this.rows - 1);
    if (final === "C") this.col = clamp(this.col + (first || 1), 0, this.cols - 1);
    if (final === "D") this.col = clamp(this.col - (first || 1), 0, this.cols - 1);
    if (final === "G") this.col = clamp((first || 1) - 1, 0, this.cols - 1);
    if (final === "d") this.row = clamp((first || 1) - 1, 0, this.rows - 1);
    if (final === "s") this.saved = { row: this.row, col: this.col };
    if (final === "u") {
      this.row = this.saved.row;
      this.col = this.saved.col;
    }
  }

  putChar(char) {
    const width = charWidth(char);
    this.buffer[this.row][this.col] = char;
    if (width > 1 && this.col + 1 < this.cols) {
      this.buffer[this.row][this.col + 1] = "";
    }
    this.col += width;
    if (this.col >= this.cols) {
      this.newLine();
    }
  }

  newLine() {
    this.row += 1;
    this.col = 0;
    if (this.row >= this.rows) {
      this.buffer.shift();
      this.buffer.push(blankLine(this.cols));
      this.row = this.rows - 1;
    }
  }
}

function parseParams(rawParams) {
  return rawParams
    .replace(/[?=>]/g, "")
    .split(/[;:]/)
    .map((item) => (item === "" ? 0 : Number.parseInt(item, 10)))
    .map((item) => (Number.isFinite(item) ? item : 0));
}

function isCsiFinal(char) {
  const code = char.charCodeAt(0);
  return code >= 0x40 && code <= 0x7e;
}

function blankLine(cols) {
  return Array.from({ length: cols }, () => " ");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function charWidth(char) {
  const code = char.codePointAt(0);
  if (code >= 0x2500 && code <= 0x257f) return 1;
  if (code >= 0x1100 && code <= 0x115f) return 2;
  if (code >= 0x2e80 && code <= 0xa4cf) return 2;
  if (code >= 0xac00 && code <= 0xd7a3) return 2;
  if (code >= 0xf900 && code <= 0xfaff) return 2;
  if (code >= 0xfe10 && code <= 0xfe19) return 2;
  if (code >= 0xfe30 && code <= 0xfe6f) return 2;
  if (code >= 0xff00 && code <= 0xff60) return 2;
  if (code >= 0xffe0 && code <= 0xffe6) return 2;
  if (code >= 0x1f300 && code <= 0x1faff) return 2;
  return 1;
}
