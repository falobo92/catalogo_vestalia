import readline from "node:readline";
import { hashPassword } from "../lib/auth.js";

if (!process.stdin.isTTY) {
  console.error("Ejecuta este comando en una terminal interactiva.");
  process.exit(1);
}
readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);
process.stdout.write("Contraseña administrativa (mínimo 12 caracteres): ");
let password = "";
for await (const chunk of process.stdin) {
  const key = String(chunk);
  if (key === "\u0003") process.exit(130);
  if (key === "\r" || key === "\n") break;
  if (key === "\u007f" || key === "\b") password = password.slice(0, -1);
  else password += key;
}
process.stdin.setRawMode(false);
process.stdout.write("\n");
if (password.length < 12) {
  console.error("La contraseña debe tener al menos 12 caracteres.");
  process.exit(1);
}
console.log(hashPassword(password));
