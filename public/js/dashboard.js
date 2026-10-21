
"use strict";

const welcomeHeading = document.getElementById("welcomeHeading");
const fullNameElement = document.getElementById("fullName");
const emailAddressElement = document.getElementById("emailAddress");
const userRoleElement = document.getElementById("userRole");
const accountStatusElement = document.getElementById("accountStatus");
const statusMessage = document.getElementById("statusMessage");
const logoutButton = document.getElementById("logoutButton");

// Inventory statistics elements
const totalClientsElement = document.getElementById("totalClients");
const totalFilesElement = document.getElementById("totalFiles");
const totalProductsElement = document.getElementById("totalProducts");
const totalVendorsElement = document.getElementById("totalVendors");
const lowStockProductsElement = document.getElementById("lowStockProducts");
const statsMessage = document.getElementById("statsMessage");

function showStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.classList.toggle("error", isError);
}

function showStatsStatus(message, isError = false) {
  if (!statsMessage) return;

  statsMessage.textContent = message;
  statsMessage.classList.toggle("error", isError);
}

async function loadDashboardStats() {
  const statElements = [
    totalClientsElement,
    totalFilesElement,
    totalProductsElement,
    totalVendorsElement,
    lowStockProductsElement
  ];

  try {
    const response = await fetch("/api/dashboard/stats", {
      method: "GET",
      credentials: "same-origin",
      headers: {
        Accept: "application/json"
      }
    });

    const data = await response.json().catch(() => ({}));

    if (response.status === 401) {
      window.location.replace("/login.html");
      return;
    }

    if (response.status === 403) {
      showStatsStatus(
        "You do not have permission to view these statistics.",
        true
      );
      return;
    }

    if (!response.ok || !data.success || !data.stats) {
      throw new Error(
        data.message || "Unable to load inventory statistics."
      );
    }

    const stats = data.stats;

    const values = {
      total_clients: totalClientsElement,
      total_files: totalFilesElement,
      total_products: totalProductsElement,
      total_vendors: totalVendorsElement,
      low_stock_products: lowStockProductsElement
    };

    for (const [key, element] of Object.entries(values)) {
      if (element) {
        const value = Number(stats[key]);

        if (!Number.isFinite(value) || value < 0) {
          throw new Error(
            "The server returned an invalid statistics value."
          );
        }

        element.textContent = value.toLocaleString("en-IN");
      }
    }

    showStatsStatus("Inventory statistics updated successfully.");
  } catch (error) {
    statElements.forEach((element) => {
      if (element) element.textContent = "—";
    });

    showStatsStatus(
      "Unable to load inventory statistics. Please refresh the page to try again.",
      true
    );

    console.error("Dashboard statistics loading failed:", error);
  }
}

async function loadDashboard() {
  try {
    const response = await fetch("/api/auth/me", {
      method: "GET",
      credentials: "same-origin",
      headers: {
        Accept: "application/json"
      }
    });

    const data = await response.json().catch(() => ({}));

    if (response.status === 401) {
      window.location.replace("/login.html");
      return;
    }

    if (!response.ok || !data.success || !data.user) {
      throw new Error(
        data.message || "Unable to verify your account."
      );
    }

    const user = data.user;

    welcomeHeading.textContent = `Welcome, ${user.fullName || "User"}`;
    fullNameElement.textContent = user.fullName || "Not available";
    emailAddressElement.textContent = user.email || "Not available";
    userRoleElement.textContent = user.role || "Not assigned";
    accountStatusElement.textContent = "Authenticated";

    showStatus("Your secure session is active.");

    // Load inventory statistics after the user session is verified.
    await loadDashboardStats();
  } catch (error) {
    welcomeHeading.textContent = "Dashboard unavailable";
    fullNameElement.textContent = "—";
    emailAddressElement.textContent = "—";
    userRoleElement.textContent = "—";
    accountStatusElement.textContent = "Unable to verify";

    showStatus(
      "Could not verify your session. Check your connection and try refreshing.",
      true
    );

    console.error("Dashboard session verification failed:", error);
  }
}

if (logoutButton) {
  logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;
    logoutButton.textContent = "Signing out...";

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json"
        }
      });

      const data = await response.json().catch(() => ({}));

      if (response.status === 401 || (response.ok && data.success)) {
        window.location.replace("/login.html");
        return;
      }

      showStatus(
        data.message || "Sign out failed. Please try again.",
        true
      );
    } catch (error) {
      showStatus(
        "Cannot connect to the server. You have not been redirected.",
        true
      );

      console.error("Logout failed:", error);
    } finally {
      logoutButton.disabled = false;
      logoutButton.textContent = "Sign out";
    }
  });
}

loadDashboard();
