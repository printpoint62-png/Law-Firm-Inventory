
"use strict";

const loginForm = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginButton = document.getElementById("loginButton");
const message = document.getElementById("message");
const togglePassword = document.getElementById("togglePassword");

function showMessage(text, type) {
  message.textContent = text;
  message.className = "message " + type;
}

if (togglePassword && passwordInput) {
  togglePassword.addEventListener("click", () => {
    const showing = passwordInput.type === "text";

    passwordInput.type = showing ? "password" : "text";
    togglePassword.textContent = showing ? "Show" : "Hide";
    togglePassword.setAttribute(
      "aria-label",
      showing ? "Show password" : "Hide password"
    );
  });
}

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    message.className = "message";

    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;

    if (!email || !password) {
      showMessage("Enter your email address and password.", "error");
      return;
    }

    loginButton.disabled = true;
    loginButton.textContent = "Signing in...";

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.success) {
        showMessage(
          data.message || "Unable to sign in. Please try again.",
          "error"
        );
        return;
      }

      showMessage("Sign-in successful. Opening dashboard...", "success");

      window.location.assign("/dashboard.html");
    } catch (error) {
      showMessage(
        "Cannot connect to the server. Ensure the application is running.",
        "error"
      );
    } finally {
      loginButton.disabled = false;
      loginButton.textContent = "Sign in securely";
    }
  });
}
