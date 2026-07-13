(() => {
  const b64 = bytes => {
    let binary = "";
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  };
  const form = document.querySelector("#setup-form");
  const message = document.querySelector("#login-message");
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const password = document.querySelector("#setup-password").value;
    if (password.length < 12) return;
    const button = form.querySelector("button");
    button.disabled = true;
    button.textContent = "Generando…";
    try {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
      const derived = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 310000 }, key, 512));
      document.querySelector("#password-hash").value = `pbkdf2$310000$sha256$1$${b64(salt)}$${b64(derived)}`;
      document.querySelector("#session-secret").value = b64(crypto.getRandomValues(new Uint8Array(48)));
      document.querySelector("#setup-results").hidden = false;
      message.textContent = "Valores listos. Copia cada uno en Vercel y después elimina la contraseña de este formulario.";
      form.reset();
    } catch {
      message.textContent = "Este navegador no pudo generar las claves. Usa Chrome, Edge o Firefox actualizado.";
    } finally {
      button.disabled = false;
      button.textContent = "Generar valores";
    }
  });
  document.querySelectorAll("[data-copy]").forEach(button => button.addEventListener("click", async () => {
    await navigator.clipboard.writeText(document.querySelector(`#${button.dataset.copy}`).value);
    button.textContent = "Copiado";
    setTimeout(() => { button.textContent = button.dataset.copy === "password-hash" ? "Copiar hash" : "Copiar secreto"; }, 1500);
  }));
})();
