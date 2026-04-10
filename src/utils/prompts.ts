// probe — tiny readline helpers for interactive prompts

import * as readline from "readline";

export function readLine(promptText: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(promptText, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// reads a line from stdin without echoing the real characters — prints an
// asterisk per keystroke so the user can see their paste/typing length while
// the actual text stays out of the terminal scrollback.
export function readLineHidden(promptText: string): Promise<string> {
  return new Promise((resolve, reject) => {
    process.stdout.write(promptText);
    const stdin = process.stdin;
    const isTTY = Boolean(stdin.isTTY);
    if (!isTTY) {
      // non-TTY fallback: just use regular line input (tests, piped input)
      const rl = readline.createInterface({ input: stdin, output: process.stdout });
      rl.question("", (answer) => {
        rl.close();
        process.stdout.write("\n");
        resolve(answer.trim());
      });
      return;
    }
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let buf = "";
    const cleanup = () => {
      stdin.removeListener("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        const code = ch.charCodeAt(0);
        if (ch === "\r" || ch === "\n") {
          cleanup();
          process.stdout.write("\n");
          resolve(buf.trim());
          return;
        }
        if (code === 3) {
          // Ctrl-C — restore terminal and exit cleanly
          cleanup();
          process.stdout.write("\n");
          reject(new Error("Input cancelled"));
          return;
        }
        if (ch === "\u0008" || ch === "\u007f") {
          if (buf.length > 0) {
            buf = buf.slice(0, -1);
            process.stdout.write("\b \b");
          }
          continue;
        }
        if (code >= 32) {
          buf += ch;
          process.stdout.write("*");
        }
      }
    };
    stdin.on("data", onData);
  });
}
