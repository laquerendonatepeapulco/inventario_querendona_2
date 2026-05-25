const loginForm = document.querySelector("#loginForm");
const loginPasswordForm = document.querySelector("#loginPasswordForm");
const loginUser = document.querySelector("#loginUser");
const loginPassword = document.querySelector("#loginPassword");
const loginNotice = document.querySelector("#loginNotice");
const changeLoginUser = document.querySelector("#changeLoginUser");
const changeCurrentPassword = document.querySelector("#changeCurrentPassword");
const changeNewPassword = document.querySelector("#changeNewPassword");
const changeConfirmPassword = document.querySelector("#changeConfirmPassword");
const changePasswordNotice = document.querySelector("#changePasswordNotice");
const showPasswordChange = document.querySelector("#showPasswordChange");
const showLoginAccess = document.querySelector("#showLoginAccess");

if (window.Auth.getCurrentUser()) {
  window.location.replace("index.html");
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(loginForm);
  clearLoginNotice();

  try {
    await window.Auth.authenticate(formData.get("loginUser"), formData.get("loginPassword"));
    window.location.href = "index.html";
  } catch (error) {
    showNotice(loginNotice, [loginUser, loginPassword], error.message || "Usuario o contrasena incorrectos.", loginPassword);
  }
});

loginPasswordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearChangePasswordNotice();

  const username = changeLoginUser.value.trim();
  const currentPassword = changeCurrentPassword.value;
  const newPassword = changeNewPassword.value;
  const confirmPassword = changeConfirmPassword.value;

  if (newPassword.length < 6) {
    showNotice(changePasswordNotice, [changeNewPassword, changeConfirmPassword], "La nueva contrasena debe tener al menos 6 caracteres.", changeNewPassword);
    return;
  }

  if (newPassword !== confirmPassword) {
    showNotice(changePasswordNotice, [changeNewPassword, changeConfirmPassword], "La confirmacion no coincide con la nueva contrasena.", changeConfirmPassword);
    return;
  }

  try {
    await window.Auth.authenticate(username, currentPassword);
    const response = await window.Auth.apiFetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "No se pudo cambiar la contrasena.");

    await window.Auth.logout().catch(() => {});
    loginPasswordForm.reset();
    loginUser.value = username;
    loginPassword.value = "";
    setPasswordMode(false);
    showNotice(loginNotice, [], "Contrasena actualizada. Ya puedes iniciar sesion.", loginPassword, "success");
  } catch (error) {
    showNotice(
      changePasswordNotice,
      [changeLoginUser, changeCurrentPassword],
      error.message || "No se pudo cambiar la contrasena.",
      changeCurrentPassword
    );
  } finally {
    await window.Auth.logout().catch(() => {});
  }
});

showPasswordChange.addEventListener("click", () => setPasswordMode(true));
showLoginAccess.addEventListener("click", () => setPasswordMode(false));

[loginUser, loginPassword].forEach((input) => input.addEventListener("input", clearLoginNotice));
[changeLoginUser, changeCurrentPassword, changeNewPassword, changeConfirmPassword].forEach((input) => {
  input.addEventListener("input", clearChangePasswordNotice);
});

function setPasswordMode(enabled) {
  clearLoginNotice();
  clearChangePasswordNotice();
  loginForm.classList.toggle("is-hidden", enabled);
  loginPasswordForm.classList.toggle("is-hidden", !enabled);
  if (enabled) {
    changeLoginUser.value = loginUser.value.trim();
    changeCurrentPassword.value = "";
    changeNewPassword.value = "";
    changeConfirmPassword.value = "";
    (changeLoginUser.value ? changeCurrentPassword : changeLoginUser).focus();
  } else {
    loginPassword.value = "";
    loginPassword.focus();
  }
}

function showNotice(notice, fields, message, focusTarget, type = "error") {
  notice.textContent = message;
  notice.classList.toggle("success", type === "success");
  notice.classList.add("show");
  fields.forEach((field) => field.classList.add("input-error"));
  focusTarget?.focus();
}

function clearLoginNotice() {
  clearNotice(loginNotice, [loginUser, loginPassword]);
}

function clearChangePasswordNotice() {
  clearNotice(changePasswordNotice, [changeLoginUser, changeCurrentPassword, changeNewPassword, changeConfirmPassword]);
}

function clearNotice(notice, fields) {
  notice.textContent = "";
  notice.classList.remove("show", "success");
  fields.forEach((field) => field.classList.remove("input-error"));
}
