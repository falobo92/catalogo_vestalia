(() => {
  const form = document.querySelector("#login-form");
  const message = document.querySelector("#login-message");
  const button = form.querySelector("button");

  fetch("/api/auth/session", { cache: "no-store" }).then(response => response.json()).then(result => {
    if (result.authenticated) window.location.replace("/editor.html");
  }).catch(() => {});

  form.addEventListener("submit", async event => {
    event.preventDefault();
    message.textContent = "";
    button.disabled = true;
    button.textContent = "Comprobando…";
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: document.querySelector("#password").value })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "No fue posible iniciar sesión.");
      window.location.replace("/editor.html");
    } catch (error) {
      message.textContent = error.message;
    } finally {
      button.disabled = false;
      button.textContent = "Entrar";
    }
  });
})();
