const THEME_KEY = "inventario_querendona-theme";

let state = {
  products: [],
  movements: [],
  incomeReport: null,
  exitReport: null,
  purchaseReport: null,
  comparisonReport: null,
  profitReport: null,
  stockAlerts: [],
  smartAlerts: [],
  users: [],
  theme: localStorage.getItem(THEME_KEY) || "light"
};
let currentUser = window.Auth.requireSession();
let activePanel = "dashboard";
let bulkPurchaseItems = [];
let bulkExitItems = [];

const DEFAULT_SUPPLIERS = ["Proveedor local", "Proveedor externo"];
const BASE_CATEGORIES = ["Agua", "Carne", "Cerveza", "Desechables", "Productos de Limpieza", "Refresco"];
const CATEGORY_SUBCATEGORIES = {
  "agua": ["Embotellada", "Garrafón", "Pipa"],
  "carne": ["Res", "Cerdo", "Pollo", "Premium", "Pescados y Mariscos", "Embutidos"],
  "refresco": ["Con Azúcar", "Sin Azúcar", "Agua Mineral", "Jugo"],
  "refreso": ["Con Azúcar", "Sin Azúcar", "Agua Mineral", "Jugo"],
  "cerveza": ["Lata", "Vidrio"],
  "lacteos": ["Natural", "Deslactosada"]
};
const CATEGORY_SUPPLIERS = {
  "refresco": ["Coca cola", "Jarritos", "Pepsi", "Peñafiel"],
  "refreso": ["Coca cola", "Jarritos", "Pepsi", "Peñafiel"],
  "abarrotes": ["Tiendas 3B", "Aurrera", "Chedraui", "Sams Club", "Tienda Rojo Gomez", "Tienda Java", "Tienda Neto", "Tienda Dif", "Oxxo"],
  "bolsas": ["Dulceria Licha", "Dulceria Oscarin", "Tienda Java", "Tienda Rojo Gomez", "Tienda Dif", "Tienda 3B"],
  "vinos y licores": ["Sams Club", "La Misión", "Tienda Java", "El Mosto", "Tienda 3B", "Tienda Neto", "Oxxo", "Aurrera", "Chedraui", "Tequila 3030"],
  "carne": ["Carniceria New York", "Carniceria El Colega", "Sams Club", "Proveedor local", "Proveedor externo"],
  "cerveza": ["Modelo", "Heineken", "La Misión", "Tienda Java", "Modelorama", "Proveedor local", "Proveedor externo"],
  "chiles secos y hiervas de olor": ["Central de abastos", "Tienda Java", "Mercado Local", "Proveedor local", "Otro"],
  "chiles secos y hierbas de olor": ["Central de abastos", "Tienda Java", "Mercado Local", "Proveedor local", "Otro"],
  "chiles secos": ["Central de abastos", "Tienda Java", "Mercado Local", "Proveedor local", "Otro"],
  "hierbas de olor": ["Central de abastos", "Tienda Java", "Mercado Local", "Proveedor local", "Otro"],
  "verdura": ["Central de abastos", "Recaudería Local", "Mercado local"],
  "frutas": ["Central de abastos", "Mercado local", "Recaudería local"],
  "lacteos": ["Merced", "Tienda Java", "Tiendas 3B", "Tienda Rojo gomez", "Aurrera", "Chedraui", "Mercado local", "Proveedor local", "Proveedor externo"],
  "desechable": ["Dulceria Licha", "Dulceria Oscarin", "Tienda Java", "Tienda Rojo Gomez", "Tienda Dif", "Tienda 3B"],
  "desechables": ["Dulceria Licha", "Dulceria Oscarin", "Tienda Java", "Tienda Rojo Gomez", "Tienda Dif", "Tienda 3B"],
  "suministro de bano": ["Tienda 3B", "Tienda Java"],
  "molino": ["Tienda Java", "Tortillería Hidalgo", "Chedraui", "Proveedor local"],
  "panaderia": ["Canela Gourmet", "Chedraui", "Proveedor local"],
  "agua": ["Jarritos", "Proveedor local", "Proveedor externo"],
  "productos de limpieza": ["Proveedor local", "Tienda 3B", "Chedraui", "Tienda Java"]
};
const ALL_SUPPLIERS = uniqueSuppliers(Object.values(CATEGORY_SUPPLIERS).flat());
const ALL_SUBCATEGORIES = uniqueLabels(Object.values(CATEGORY_SUBCATEGORIES).flat());
const STANDARD_MEASURE_UNITS = [
  "Pieza",
  "Kilogramo",
  "Gramo",
  "Onza",
  "Litro",
  "Mililitro",
  "Caja",
  "Paquete",
  "Bolsa",
  "Botella",
  "Lata",
  "Garrafon",
  "Cubeta",
  "Charola",
  "Costal",
  "Bulto",
  "Manojo",
  "Rollo",
  "Docena",
  "Porcion",
  "Rebanada",
  "Barra",
  "Sobre",
  "Frasco",
  "Galon"
];
const MEAT_MEASURE_UNITS = ["1 kg", "1/2 kg", "1/4 kg"];
const MEAT_CUSTOM_MEASURE_VALUE = "__custom_meat_measure__";
const PRODUCT_SUGGESTION_LIMIT = 8;
const productSuggestionState = {
  purchase: { products: [], activeIndex: -1 },
  exit: { products: [], activeIndex: -1 },
  bulkPurchase: { products: [], activeIndex: -1 },
  bulkExit: { products: [], activeIndex: -1 }
};
const PRODUCT_AUTOCOMPLETE_KINDS = Object.keys(productSuggestionState);

const els = {
  panels: document.querySelectorAll(".panel"),
  navItems: document.querySelectorAll(".nav-item"),
  mobileNavSelect: document.querySelector("#mobileNavSelect"),
  categoryFilter: document.querySelector("#categoryFilter"),
  downloadCategoryExcel: document.querySelector("#downloadCategoryExcel"),
  subcategoryFilter: document.querySelector("#subcategoryFilter"),
  stockFilter: document.querySelector("#stockFilter"),
  productSearch: document.querySelector("#productSearch"),
  productRows: document.querySelector("#productRows"),
  alertList: document.querySelector("#alertList"),
  smartAlertCount: document.querySelector("#smartAlertCount"),
  dashboardPrimaryGrid: document.querySelector("#dashboardPrimaryGrid"),
  adminAlertSection: document.querySelector("#adminAlertSection"),
  adminAlertList: document.querySelector("#adminAlertList"),
  adminAlertCount: document.querySelector("#adminAlertCount"),
  movementTimeline: document.querySelector("#movementTimeline"),
  movementTypeFilter: document.querySelector("#movementTypeFilter"),
  reportStart: document.querySelector("#reportStart"),
  reportEnd: document.querySelector("#reportEnd"),
  reportIncome: document.querySelector("#reportIncome"),
  reportUnits: document.querySelector("#reportUnits"),
  reportMovements: document.querySelector("#reportMovements"),
  reportRange: document.querySelector("#reportRange"),
  incomeReportRows: document.querySelector("#incomeReportRows"),
  exitStart: document.querySelector("#exitStart"),
  exitEnd: document.querySelector("#exitEnd"),
  exitTotalValue: document.querySelector("#exitTotalValue"),
  exitUnits: document.querySelector("#exitUnits"),
  exitMovements: document.querySelector("#exitMovements"),
  exitRange: document.querySelector("#exitRange"),
  exitReportRows: document.querySelector("#exitReportRows"),
  exitRegisterForm: document.querySelector("#exitRegisterForm"),
  exitCategory: document.querySelector("#exitCategory"),
  exitSubcategory: document.querySelector("#exitSubcategory"),
  exitProduct: document.querySelector("#exitProduct"),
  exitProductSearch: document.querySelector("#exitProductSearch"),
  exitProductOptions: document.querySelector("#exitProductOptions"),
  exitMeasureUnit: document.querySelector("#exitMeasureUnit"),
  exitRegisterMovementType: document.querySelector("#exitRegisterMovementType"),
  exitSupplierType: document.querySelector("#exitSupplierType"),
  exitRegisterQuantity: document.querySelector("#exitRegisterQuantity"),
  exitRegisterNote: document.querySelector("#exitRegisterNote"),
  exitStockPreview: document.querySelector("#exitStockPreview"),
  comparisonStart: document.querySelector("#comparisonStart"),
  comparisonEnd: document.querySelector("#comparisonEnd"),
  comparisonPurchasedUnits: document.querySelector("#comparisonPurchasedUnits"),
  comparisonUsedUnits: document.querySelector("#comparisonUsedUnits"),
  comparisonConsumedCost: document.querySelector("#comparisonConsumedCost"),
  comparisonNetUnits: document.querySelector("#comparisonNetUnits"),
  comparisonRows: document.querySelector("#comparisonRows"),
  purchaseForm: document.querySelector("#purchaseForm"),
  purchaseCategory: document.querySelector("#purchaseCategory"),
  purchaseSubcategory: document.querySelector("#purchaseSubcategory"),
  purchaseProduct: document.querySelector("#purchaseProduct"),
  purchaseProductSearch: document.querySelector("#purchaseProductSearch"),
  purchaseProductOptions: document.querySelector("#purchaseProductOptions"),
  purchaseMeasureUnit: document.querySelector("#purchaseMeasureUnit"),
  purchaseSupplier: document.querySelector("#purchaseSupplier"),
  purchaseQuantity: document.querySelector("#purchaseQuantity"),
  purchaseUnitCost: document.querySelector("#purchaseUnitCost"),
  purchaseNote: document.querySelector("#purchaseNote"),
  purchaseTotal: document.querySelector("#purchaseTotal"),
  purchaseStart: document.querySelector("#purchaseStart"),
  purchaseEnd: document.querySelector("#purchaseEnd"),
  purchaseReportCategory: document.querySelector("#purchaseReportCategory"),
  purchaseReportProduct: document.querySelector("#purchaseReportProduct"),
  purchaseTotalCost: document.querySelector("#purchaseTotalCost"),
  purchaseUnits: document.querySelector("#purchaseUnits"),
  purchaseEntries: document.querySelector("#purchaseEntries"),
  purchaseSuppliers: document.querySelector("#purchaseSuppliers"),
  purchaseRows: document.querySelector("#purchaseRows"),
  editPurchaseModal: document.querySelector("#editPurchaseModal"),
  editPurchaseForm: document.querySelector("#editPurchaseForm"),
  editPurchaseId: document.querySelector("#editPurchaseId"),
  editPurchaseSubtitle: document.querySelector("#editPurchaseSubtitle"),
  editPurchaseSupplier: document.querySelector("#editPurchaseSupplier"),
  editPurchaseQuantity: document.querySelector("#editPurchaseQuantity"),
  editPurchaseMeasureUnit: document.querySelector("#editPurchaseMeasureUnit"),
  editPurchaseUnitCost: document.querySelector("#editPurchaseUnitCost"),
  editPurchaseNote: document.querySelector("#editPurchaseNote"),
  deleteEditPurchase: document.querySelector("#deleteEditPurchase"),
  bulkPurchaseModal: document.querySelector("#bulkPurchaseModal"),
  bulkPurchaseSupplier: document.querySelector("#bulkPurchaseSupplier"),
  bulkPurchaseCategory: document.querySelector("#bulkPurchaseCategory"),
  bulkPurchaseSubcategory: document.querySelector("#bulkPurchaseSubcategory"),
  bulkPurchaseProduct: document.querySelector("#bulkPurchaseProduct"),
  bulkPurchaseProductSearch: document.querySelector("#bulkPurchaseProductSearch"),
  bulkPurchaseProductOptions: document.querySelector("#bulkPurchaseProductOptions"),
  bulkPurchaseMeasureUnit: document.querySelector("#bulkPurchaseMeasureUnit"),
  bulkPurchaseQuantity: document.querySelector("#bulkPurchaseQuantity"),
  bulkPurchaseUnitCost: document.querySelector("#bulkPurchaseUnitCost"),
  bulkPurchaseItems: document.querySelector("#bulkPurchaseItems"),
  bulkPurchaseCount: document.querySelector("#bulkPurchaseCount"),
  bulkPurchaseTotal: document.querySelector("#bulkPurchaseTotal"),
  bulkPurchaseNote: document.querySelector("#bulkPurchaseNote"),
  bulkExitModal: document.querySelector("#bulkExitModal"),
  bulkExitMovementType: document.querySelector("#bulkExitMovementType"),
  bulkExitSupplierType: document.querySelector("#bulkExitSupplierType"),
  bulkExitCategory: document.querySelector("#bulkExitCategory"),
  bulkExitSubcategory: document.querySelector("#bulkExitSubcategory"),
  bulkExitProduct: document.querySelector("#bulkExitProduct"),
  bulkExitProductSearch: document.querySelector("#bulkExitProductSearch"),
  bulkExitProductOptions: document.querySelector("#bulkExitProductOptions"),
  bulkExitMeasureUnit: document.querySelector("#bulkExitMeasureUnit"),
  bulkExitQuantity: document.querySelector("#bulkExitQuantity"),
  bulkExitItems: document.querySelector("#bulkExitItems"),
  bulkExitCount: document.querySelector("#bulkExitCount"),
  bulkExitTotal: document.querySelector("#bulkExitTotal"),
  bulkExitNote: document.querySelector("#bulkExitNote"),
  editExitModal: document.querySelector("#editExitModal"),
  editExitForm: document.querySelector("#editExitForm"),
  editExitId: document.querySelector("#editExitId"),
  editExitSubtitle: document.querySelector("#editExitSubtitle"),
  editExitMovementType: document.querySelector("#editExitMovementType"),
  editExitSupplierType: document.querySelector("#editExitSupplierType"),
  editExitQuantity: document.querySelector("#editExitQuantity"),
  editExitMeasureUnit: document.querySelector("#editExitMeasureUnit"),
  editExitNote: document.querySelector("#editExitNote"),
  profitStart: document.querySelector("#profitStart"),
  profitEnd: document.querySelector("#profitEnd"),
  profitIncome: document.querySelector("#profitIncome"),
  profitCost: document.querySelector("#profitCost"),
  profitGain: document.querySelector("#profitGain"),
  profitMargin: document.querySelector("#profitMargin"),
  profitRows: document.querySelector("#profitRows"),
  modal: document.querySelector("#productModal"),
  quickModal: document.querySelector("#quickProductModal"),
  quickTitle: document.querySelector("#quickProductTitle"),
  quickSubtitle: document.querySelector("#quickProductSubtitle"),
  quickBody: document.querySelector("#quickProductBody"),
  exitModal: document.querySelector("#exitModal"),
  exitForm: document.querySelector("#exitForm"),
  exitProductId: document.querySelector("#exitProductId"),
  exitProductName: document.querySelector("#exitProductName"),
  exitMovementType: document.querySelector("#exitMovementType"),
  exitModalMeasureUnit: document.querySelector("#exitModalMeasureUnit"),
  exitQuantity: document.querySelector("#exitQuantity"),
  exitNote: document.querySelector("#exitNote"),
  form: document.querySelector("#productForm"),
  modalTitle: document.querySelector("#modalTitle"),
  toast: document.querySelector("#toast"),
  chart: document.querySelector("#categoryChart"),
  currentUserName: document.querySelector("#currentUserName"),
  currentUserRole: document.querySelector("#currentUserRole"),
  mobileCurrentUserName: document.querySelector("#mobileCurrentUserName"),
  mobileCurrentUserRole: document.querySelector("#mobileCurrentUserRole"),
  changePasswordForm: document.querySelector("#changePasswordForm"),
  currentPassword: document.querySelector("#currentPassword"),
  newPassword: document.querySelector("#newPassword"),
  confirmPassword: document.querySelector("#confirmPassword"),
  adminPasswordResetCard: document.querySelector("#adminPasswordResetCard"),
  resetUserPasswordForm: document.querySelector("#resetUserPasswordForm"),
  resetPasswordUser: document.querySelector("#resetPasswordUser"),
  resetPasswordValue: document.querySelector("#resetPasswordValue"),
  resetPasswordConfirm: document.querySelector("#resetPasswordConfirm")
};

const formatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  currencyDisplay: "code",
  maximumFractionDigits: 0
});

const percentFormatter = new Intl.NumberFormat("es-MX", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0
});

const movementTypeLabels = {
  alta: "Alta",
  entrada: "Entrada",
  compra: "Compra",
  reposicion: "Reposicion",
  venta: "Uso en cocina",
  salida: "Uso de insumo",
  ajuste: "Ajuste",
  merma: "Merma",
  danado: "Producto dañado",
  consumo_interno: "Consumo interno",
  eliminacion: "Eliminacion"
};

const exitTypeNotes = {
  venta: "Uso en cocina",
  merma: "Merma",
  danado: "Producto dañado",
  consumo_interno: "Consumo interno",
  ajuste: "Ajuste de inventario"
};

async function init() {
  document.body.classList.toggle("dark", state.theme === "dark");
  setDefaultReportDates();
  bindEvents();
  currentUser = await window.Auth.verifySession();
  if (!currentUser) {
    window.location.replace("login.html");
    return;
  }
  await loadRemoteData();
  render();
  renderSession();
}

async function loadRemoteData() {
  const requests = [
    window.Auth.apiFetch("/api/products"),
    window.Auth.apiFetch("/api/movements")
  ];

  if (isAdmin()) {
    requests.push(window.Auth.apiFetch("/api/stock-alerts"));
    requests.push(window.Auth.apiFetch("/api/smart-alerts"));
    requests.push(window.Auth.apiFetch("/api/users"));
  }

  const [productsResponse, movementsResponse, alertsResponse, smartAlertsResponse, usersResponse] = await Promise.all(requests);

  const productsPayload = await productsResponse.json();
  const movementsPayload = await movementsResponse.json();
  state.products = productsPayload.products || [];
  state.movements = movementsPayload.movements || [];
  state.stockAlerts = alertsResponse ? (await safeJsonPayload(alertsResponse)).alerts || [] : [];
  state.smartAlerts = smartAlertsResponse ? (await safeJsonPayload(smartAlertsResponse)).alerts || [] : [];
  state.users = usersResponse ? (await safeJsonPayload(usersResponse)).users || [] : [];
}

async function safeJsonPayload(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return {};
  return response.json();
}

function bindEvents() {
  els.navItems.forEach((item) => {
    item.addEventListener("click", () => switchPanel(item.dataset.panel));
  });
  els.mobileNavSelect.addEventListener("change", () => switchPanel(els.mobileNavSelect.value));

  document.querySelectorAll("#openProductModal, #mobileOpenProductModal").forEach((button) => {
    button.addEventListener("click", () => openModal());
  });
  document.querySelectorAll("#logoutButton, #mobileLogoutButton").forEach((button) => {
    button.addEventListener("click", logout);
  });
  document.querySelector("#closeProductModal").addEventListener("click", closeModal);
  document.querySelector("#cancelProduct").addEventListener("click", closeModal);
  document.querySelector("#closeQuickProductModal").addEventListener("click", closeQuickProductModal);
  document.querySelector("#closeExitModal").addEventListener("click", closeExitModal);
  document.querySelector("#cancelExit").addEventListener("click", closeExitModal);
  document.querySelectorAll("#themeToggle, #mobileThemeToggle").forEach((button) => {
    button.addEventListener("click", toggleTheme);
  });
  document.querySelector("#downloadBackup").addEventListener("click", downloadBackup);
  document.querySelector("#resetDemo").addEventListener("click", resetDemo);
  document.querySelector("#clearMovements").addEventListener("click", clearMovements);
  document.querySelector("#loadIncomeReport").addEventListener("click", loadIncomeReport);
  document.querySelector("#downloadIncomeReport").addEventListener("click", downloadIncomeReport);
  document.querySelectorAll("#downloadCategoryExcel, #mobileDownloadCategoryExcel").forEach((button) => {button.addEventListener("click", downloadCategoryExcel);});
  document.querySelector("#loadExitReport").addEventListener("click", loadExitReport);
  document.querySelector("#downloadExitReport").addEventListener("click", downloadExitReport);
  document.querySelector("#openBulkExitModal").addEventListener("click", openBulkExitModal);
  document.querySelector("#closeBulkExitModal").addEventListener("click", closeBulkExitModal);
  document.querySelector("#cancelBulkExit").addEventListener("click", closeBulkExitModal);
  document.querySelector("#closeEditExitModal").addEventListener("click", closeEditExitModal);
  document.querySelector("#cancelEditExit").addEventListener("click", closeEditExitModal);
  document.querySelector("#addBulkExitItem").addEventListener("click", addBulkExitItem);
  document.querySelector("#saveBulkExit").addEventListener("click", saveBulkExit);
  document.querySelector("#clearExitRegisterForm").addEventListener("click", resetExitRegisterForm);
  document.querySelector("#loadComparisonReport").addEventListener("click", loadComparisonReport);
  document.querySelector("#downloadComparisonReport").addEventListener("click", downloadComparisonReport);
  document.querySelector("#loadPurchaseReport").addEventListener("click", loadPurchaseReport);
  document.querySelector("#downloadPurchaseReport").addEventListener("click", downloadPurchaseReport);
  document.querySelector("#openBulkPurchaseModal").addEventListener("click", openBulkPurchaseModal);
  document.querySelector("#closeBulkPurchaseModal").addEventListener("click", closeBulkPurchaseModal);
  document.querySelector("#cancelBulkPurchase").addEventListener("click", closeBulkPurchaseModal);
  document.querySelector("#closeEditPurchaseModal").addEventListener("click", closeEditPurchaseModal);
  document.querySelector("#cancelEditPurchase").addEventListener("click", closeEditPurchaseModal);
  els.deleteEditPurchase.addEventListener("click", deleteEditedPurchase);
  document.querySelector("#addBulkPurchaseItem").addEventListener("click", addBulkPurchaseItem);
  document.querySelector("#saveBulkPurchase").addEventListener("click", saveBulkPurchase);
  document.querySelector("#clearPurchaseForm").addEventListener("click", resetPurchaseForm);
  document.querySelector("#loadProfitReport").addEventListener("click", loadProfitReport);
  document.querySelector("#downloadProfitReport").addEventListener("click", downloadProfitReport);
  document.querySelector("#importFile").addEventListener("change", importBackup);
  els.changePasswordForm.addEventListener("submit", changePassword);
  els.resetUserPasswordForm.addEventListener("submit", resetUserPassword);

  els.categoryFilter.addEventListener("change", () => {
    renderSubcategoryFilter();
    renderProducts();
  });
  els.subcategoryFilter.addEventListener("change", renderProducts);
  els.stockFilter.addEventListener("change", renderProducts);
  els.productSearch.addEventListener("input", renderProducts);
  els.movementTypeFilter.addEventListener("change", renderMovements);
  els.form.addEventListener("submit", saveProductFromForm);
  els.exitForm.addEventListener("submit", saveDetailedExit);
  els.exitRegisterForm.addEventListener("submit", saveExitFromSection);
  els.editExitForm.addEventListener("submit", saveEditedExit);
  els.exitMovementType.addEventListener("change", () => {
    els.exitNote.value = exitTypeNotes[els.exitMovementType.value] || "Uso en cocina";
  });
  els.exitRegisterMovementType.addEventListener("change", () => {
    els.exitRegisterNote.value = exitTypeNotes[els.exitRegisterMovementType.value] || "Uso en cocina";
  });
  els.editExitMovementType.addEventListener("change", () => {
    els.editExitNote.value = exitTypeNotes[els.editExitMovementType.value] || "Uso en cocina";
  });
  els.exitCategory.addEventListener("change", () => {
    renderExitOptions();
    fillExitRegisterDefaults();
  });
  els.exitSubcategory.addEventListener("change", () => {
    renderExitOptions();
    fillExitRegisterDefaults();
  });
  els.exitProductSearch.addEventListener("input", syncExitProductFromSearch);
  els.exitProductSearch.addEventListener("change", syncExitProductFromSearch);
  els.exitProductSearch.addEventListener("focus", () => renderProductSuggestions("exit"));
  els.exitProductSearch.addEventListener("blur", () => closeProductSuggestionsSoon("exit"));
  els.exitProductSearch.addEventListener("keydown", (event) => handleProductSearchKeydown("exit", event));
  els.exitProductOptions.addEventListener("mousedown", (event) => event.preventDefault());
  els.exitProductOptions.addEventListener("click", (event) => handleProductSuggestionClick("exit", event));
  els.bulkExitMovementType.addEventListener("change", () => {
    els.bulkExitNote.value = exitTypeNotes[els.bulkExitMovementType.value] || "Uso en cocina";
  });
  els.bulkExitCategory.addEventListener("change", () => {
    closeProductSuggestions("bulkExit");
    renderLinkedSubcategorySelect(
      els.bulkExitSubcategory,
      els.bulkExitCategory.value,
      state.products.filter((product) => Number(product.stock) > 0)
    );
    renderBulkExitProductOptions();
    renderBulkExitSupplierOptions();
    fillBulkExitDefaults();
  });
  els.bulkExitSubcategory.addEventListener("change", () => {
    closeProductSuggestions("bulkExit");
    renderBulkExitProductOptions();
    fillBulkExitDefaults();
  });
  els.bulkExitProductSearch.addEventListener("input", syncBulkExitProductFromSearch);
  els.bulkExitProductSearch.addEventListener("change", syncBulkExitProductFromSearch);
  els.bulkExitProductSearch.addEventListener("focus", () => renderProductSuggestions("bulkExit"));
  els.bulkExitProductSearch.addEventListener("blur", () => closeProductSuggestionsSoon("bulkExit"));
  els.bulkExitProductSearch.addEventListener("keydown", (event) => handleProductSearchKeydown("bulkExit", event));
  els.bulkExitProductOptions.addEventListener("mousedown", (event) => event.preventDefault());
  els.bulkExitProductOptions.addEventListener("click", (event) => handleProductSuggestionClick("bulkExit", event));
  els.bulkExitItems.addEventListener("change", handleBulkExitItems);
  els.bulkExitItems.addEventListener("click", handleBulkExitItems);
  els.purchaseCategory.addEventListener("change", () => {
    renderPurchaseOptions();
    renderPurchaseSupplierOptions();
    fillPurchaseDefaults();
  });
  els.purchaseSubcategory.addEventListener("change", () => {
    renderPurchaseOptions();
    fillPurchaseDefaults();
  });
  els.purchaseForm.addEventListener("submit", savePurchaseFromForm);
  els.editPurchaseForm.addEventListener("submit", saveEditedPurchase);
  els.purchaseProductSearch.addEventListener("input", syncPurchaseProductFromSearch);
  els.purchaseProductSearch.addEventListener("change", syncPurchaseProductFromSearch);
  els.purchaseProductSearch.addEventListener("focus", () => renderProductSuggestions("purchase"));
  els.purchaseProductSearch.addEventListener("blur", () => closeProductSuggestionsSoon("purchase"));
  els.purchaseProductSearch.addEventListener("keydown", (event) => handleProductSearchKeydown("purchase", event));
  els.purchaseProductOptions.addEventListener("mousedown", (event) => event.preventDefault());
  els.purchaseProductOptions.addEventListener("click", (event) => handleProductSuggestionClick("purchase", event));
  els.bulkPurchaseCategory.addEventListener("change", () => {
    closeProductSuggestions("bulkPurchase");
    renderLinkedSubcategorySelect(els.bulkPurchaseSubcategory, els.bulkPurchaseCategory.value);
    renderBulkPurchaseProductOptions();
    renderBulkPurchaseSupplierOptions();
    fillBulkPurchaseDefaults();
  });
  els.bulkPurchaseSubcategory.addEventListener("change", () => {
    closeProductSuggestions("bulkPurchase");
    renderBulkPurchaseProductOptions();
    fillBulkPurchaseDefaults();
  });
  els.bulkPurchaseProductSearch.addEventListener("input", syncBulkPurchaseProductFromSearch);
  els.bulkPurchaseProductSearch.addEventListener("change", syncBulkPurchaseProductFromSearch);
  els.bulkPurchaseProductSearch.addEventListener("focus", () => renderProductSuggestions("bulkPurchase"));
  els.bulkPurchaseProductSearch.addEventListener("blur", () => closeProductSuggestionsSoon("bulkPurchase"));
  els.bulkPurchaseProductSearch.addEventListener("keydown", (event) => handleProductSearchKeydown("bulkPurchase", event));
  els.bulkPurchaseProductOptions.addEventListener("mousedown", (event) => event.preventDefault());
  els.bulkPurchaseProductOptions.addEventListener("click", (event) => handleProductSuggestionClick("bulkPurchase", event));
  els.bulkPurchaseItems.addEventListener("change", handleBulkPurchaseItems);
  els.bulkPurchaseItems.addEventListener("click", handleBulkPurchaseItems);
  els.purchaseReportCategory.addEventListener("change", () => {
    renderPurchaseReportProductFilter();
    loadPurchaseReport();
  });
  els.purchaseReportProduct.addEventListener("change", loadPurchaseReport);
  els.purchaseQuantity.addEventListener("input", updatePurchaseTotal);
  els.purchaseUnitCost.addEventListener("input", updatePurchaseTotal);
  els.exitRegisterQuantity.addEventListener("input", updateExitStockPreview);
  [
    els.purchaseMeasureUnit,
    els.bulkPurchaseMeasureUnit,
    els.exitMeasureUnit,
    els.bulkExitMeasureUnit,
    els.exitModalMeasureUnit,
    els.editPurchaseMeasureUnit,
    els.editExitMeasureUnit
  ].forEach((select) => {
    select?.addEventListener("change", () => handleMeasureUnitChange(select));
  });
  els.modal.addEventListener("click", (event) => {
    if (event.target === els.modal) closeModal();
  });
  els.quickModal.addEventListener("click", (event) => {
    if (event.target === els.quickModal) closeQuickProductModal();
  });
  els.exitModal.addEventListener("click", (event) => {
    if (event.target === els.exitModal) closeExitModal();
  });
  els.bulkPurchaseModal.addEventListener("click", (event) => {
    if (event.target === els.bulkPurchaseModal) closeBulkPurchaseModal();
  });
  els.bulkExitModal.addEventListener("click", (event) => {
    if (event.target === els.bulkExitModal) closeBulkExitModal();
  });
  els.editPurchaseModal.addEventListener("click", (event) => {
    if (event.target === els.editPurchaseModal) closeEditPurchaseModal();
  });
  els.editExitModal.addEventListener("click", (event) => {
    if (event.target === els.editExitModal) closeEditExitModal();
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".product-autocomplete")) {
      PRODUCT_AUTOCOMPLETE_KINDS.forEach(closeProductSuggestions);
    }
  });
}

async function logout() {
  await window.Auth.logout();
  closeModal();
  closeQuickProductModal();
  closeExitModal();
  closeBulkPurchaseModal();
  closeBulkExitModal();
  closeEditPurchaseModal();
  closeEditExitModal();
  window.location.href = "login.html";
}

async function changePassword(event) {
  event.preventDefault();

  const currentPassword = els.currentPassword.value;
  const newPassword = els.newPassword.value;
  const confirmPassword = els.confirmPassword.value;

  if (newPassword.length < 6) {
    showToast("La nueva contrasena debe tener al menos 6 caracteres.");
    return;
  }

  if (newPassword !== confirmPassword) {
    showToast("La confirmacion no coincide con la nueva contrasena.");
    return;
  }

  const response = await window.Auth.apiFetch("/api/auth/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword, newPassword })
  });
  const payload = await response.json();
  if (!response.ok) {
    showToast(payload.error || "No se pudo cambiar la contrasena.");
    return;
  }

  els.changePasswordForm.reset();
  showToast("Contrasena actualizada.");
}

async function resetUserPassword(event) {
  event.preventDefault();
  if (!requireAdmin()) return;

  const userId = els.resetPasswordUser.value;
  const newPassword = els.resetPasswordValue.value;
  const confirmPassword = els.resetPasswordConfirm.value;
  const user = state.users.find((item) => item.id === userId);

  if (!user) {
    showToast("Selecciona un usuario.");
    return;
  }

  if (newPassword.length < 6) {
    showToast("La contrasena temporal debe tener al menos 6 caracteres.");
    return;
  }

  if (newPassword !== confirmPassword) {
    showToast("La confirmacion no coincide con la contrasena temporal.");
    return;
  }

  const response = await window.Auth.apiFetch(`/api/users/${encodeURIComponent(userId)}/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newPassword })
  });
  const payload = await response.json();
  if (!response.ok) {
    showToast(payload.error || "No se pudo restablecer la contrasena.");
    return;
  }

  els.resetUserPasswordForm.reset();
  renderResetPasswordUsers();
  showToast(`Contrasena temporal asignada a ${user.name}.`);
}

function renderSession() {
  currentUser = window.Auth.getCurrentUser();
  if (!currentUser) {
    window.location.replace("login.html");
    return;
  }

  els.currentUserName.textContent = currentUser?.name || "Sin sesion";
  els.currentUserRole.textContent = currentUser?.label || "Bloqueado";
  els.mobileCurrentUserName.textContent = currentUser?.name || "Sin sesion";
  els.mobileCurrentUserRole.textContent = currentUser?.label || "Bloqueado";
  if (els.adminAlertSection) {
    els.adminAlertSection.hidden = !isAdmin();
  }
  if (els.dashboardPrimaryGrid) {
    els.dashboardPrimaryGrid.classList.toggle("single-column", !isAdmin());
  }
  if (els.adminPasswordResetCard) {
    els.adminPasswordResetCard.hidden = !isAdmin();
  }
  document.querySelectorAll("#openProductModal, #mobileOpenProductModal").forEach((productButton) => {
    productButton.hidden = !isAdmin();
    productButton.disabled = !isAdmin();
  });
  document.querySelectorAll("[data-admin-only]").forEach((node) => {
    node.disabled = !isAdmin();
  });

if (!isAdmin()) {
  const allowedPanels = ["entries", "exits"];

  document.querySelectorAll(".nav-item").forEach((item) => {
    if (!allowedPanels.includes(item.dataset.panel)) {
      item.style.display = "none";
    }
  });

  Array.from(els.mobileNavSelect.options).forEach((option) => {
    if (!allowedPanels.includes(option.value)) {
      option.remove();
    }
  });

  switchPanel("entries");
}



  const adminControls = [
    "#downloadBackup",
    "#resetDemo",
    "#clearMovements",
    "#loadIncomeReport",
    "#downloadIncomeReport",
    "#loadProfitReport",
    "#downloadProfitReport",
    "#reportStart",
    "#reportEnd",
    "#profitStart",
    "#profitEnd",
    "#importFile",
    "#resetPasswordUser",
    "#resetPasswordValue",
    "#resetPasswordConfirm",
    "#resetUserPasswordButton"
  ];
  adminControls.forEach((selector) => {
    const node = document.querySelector(selector);
    if (node) node.disabled = !isAdmin();
  });

  const stockControls = [
    "#purchaseProduct",
    "#purchaseProductSearch",
    "#purchaseMeasureUnit",
    "#purchaseSupplier",
    "#purchaseQuantity",
    "#purchaseUnitCost",
    "#purchaseNote",
    "#openBulkPurchaseModal",
    "#bulkPurchaseSupplier",
    "#bulkPurchaseCategory",
    "#bulkPurchaseProduct",
    "#bulkPurchaseProductSearch",
    "#bulkPurchaseMeasureUnit",
    "#bulkPurchaseQuantity",
    "#bulkPurchaseUnitCost",
    "#bulkPurchaseNote",
    "#addBulkPurchaseItem",
    "#saveBulkPurchase",
    "#clearPurchaseForm",
    "#savePurchase",
    "#loadPurchaseReport",
    "#downloadPurchaseReport",
    "#loadExitReport",
    "#downloadExitReport",
    "#openBulkExitModal",
    "#bulkExitMovementType",
    "#bulkExitSupplierType",
    "#bulkExitCategory",
    "#bulkExitProduct",
    "#bulkExitProductSearch",
    "#bulkExitMeasureUnit",
    "#bulkExitQuantity",
    "#bulkExitNote",
    "#addBulkExitItem",
    "#saveBulkExit",
    "#loadComparisonReport",
    "#downloadComparisonReport",
    "#exitCategory",
    "#exitProductSearch",
    "#exitProduct",
    "#exitMeasureUnit",
    "#exitRegisterMovementType",
    "#exitModalMeasureUnit",
    "#exitSupplierType",
    "#exitRegisterQuantity",
    "#exitRegisterNote",
    "#clearExitRegisterForm",
    "#saveExitRegister",
    "#exitStart",
    "#exitEnd",
    "#comparisonStart",
    "#comparisonEnd",
    "#purchaseStart",
    "#purchaseEnd",
    "#purchaseCategory",
    "#purchaseReportCategory",
    "#purchaseReportProduct"
  ];
  stockControls.forEach((selector) => {
    const node = document.querySelector(selector);
    if (node) node.disabled = !canManageStock();
  });
}

function renderResetPasswordUsers() {
  if (!els.resetPasswordUser) return;

  const current = els.resetPasswordUser.value;
  els.resetPasswordUser.innerHTML = "";

  if (!isAdmin()) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Solo administradores";
    els.resetPasswordUser.append(option);
    return;
  }

  const users = [...state.users].sort((a, b) => {
    const roleOrder = a.role.localeCompare(b.role);
    if (roleOrder !== 0) return roleOrder;
    return a.name.localeCompare(b.name);
  });

  users.forEach((user) => {
    const option = document.createElement("option");
    option.value = user.id;
    option.textContent = `${user.name} - ${user.username} (${user.label})`;
    els.resetPasswordUser.append(option);
  });

  if (users.some((user) => user.id === current)) {
    els.resetPasswordUser.value = current;
  }
}

function switchPanel(panel) {

  if (!isAdmin()) {
    const allowedPanels = ["entries", "exits"];

    if (!allowedPanels.includes(panel)) {
      panel = "entries";
    }
  }

  activePanel = panel;

  document.querySelectorAll("#downloadCategoryExcel, #mobileDownloadCategoryExcel").forEach((excelButton) => {
    const showExcelButton = panel === "products" && isAdmin();
    excelButton.hidden = !showExcelButton;
    excelButton.style.display = showExcelButton ? "inline-flex" : "none";
  });
 


  els.panels.forEach((node) =>
    node.classList.toggle("active", node.id === panel)
  );

  els.navItems.forEach((node) =>
    node.classList.toggle("active", node.dataset.panel === panel)
  );

  els.mobileNavSelect.value = panel;


  if (panel === "dashboard") animateDashboardChart();
  if (panel === "entries" && canManageStock() && !state.purchaseReport) loadPurchaseReport();
  if (panel === "reports" && isAdmin() && !state.incomeReport) loadIncomeReport();
  if (panel === "exits" && canManageStock() && !state.exitReport) loadExitReport();
  if (panel === "comparison" && canManageStock() && !state.comparisonReport) loadComparisonReport();
  if (panel === "profit" && isAdmin() && !state.profitReport) loadProfitReport();
}

function isAdmin() {
  return currentUser?.role === "admin";
}

function canManageStock() {
  return ["admin", "staff"].includes(currentUser?.role);
}

function requireLogin() {
  if (currentUser) return true;
  showToast("Inicia sesion para usar el sistema.");
  renderSession();
  return false;
}

function requireAdmin() {
  if (isAdmin()) return true;
  showToast("Solo admin puede administrar productos.");
  return false;
}

function requireStockAccess() {
  if (canManageStock()) return true;
  showToast("Tu usuario no puede registrar movimientos de inventario.");
  return false;
}

function render() {
  renderMetrics();
  renderCategoryFilter();
  renderSubcategoryFilter();
  renderProducts();
  renderAlerts();
  renderAdminAlerts();
  renderMovementTypeFilter();
  renderMovements();
  renderPurchaseOptions();
  renderExitOptions();
  renderPurchaseReport();
  renderIncomeReport();
  renderExitReport();
  renderComparisonReport();
  renderProfitReport();
  renderResetPasswordUsers();
  animateChart();
  renderSession();
}

function filteredProducts() {
  const category = els.categoryFilter.value;
  const subcategory = els.subcategoryFilter.value;
  const stock = els.stockFilter.value;
  const search = normalizeSearch(els.productSearch.value);

  return state.products.filter((product) => {
    const statusMatch = stock === "all" || getStockStatus(product).key === stock;
    const searchMatch = !search || normalizeSearch([
      product.name,
      product.sku,
      product.description,
      product.category,
      product.subcategory
    ].join(" ")).includes(search);
    return matchesCategoryAndSubcategory(product, category, subcategory) && statusMatch && searchMatch;
  }).sort(compareProductsAlphabetically);
}

function compareProductsAlphabetically(a, b) {
  const nameOrder = String(a.name || "").localeCompare(String(b.name || ""), "es", {
    numeric: true,
    sensitivity: "base"
  });
  if (nameOrder !== 0) return nameOrder;
  return String(a.sku || "").localeCompare(String(b.sku || ""), "es", {
    numeric: true,
    sensitivity: "base"
  });
}

function uniqueLabels(labels) {
  const seen = new Set();
  return labels.reduce((items, label) => {
    const clean = String(label || "").trim().replace(/\s+/g, " ");
    const key = supplierKey(clean);
    if (!clean || seen.has(key)) return items;
    seen.add(key);
    items.push(clean);
    return items;
  }, []);
}

function getCategoryOptions(products = state.products) {
  return [...new Set([
    ...BASE_CATEGORIES,
    ...products.map((product) => product.category).filter(Boolean)
  ])].sort((a, b) => a.localeCompare(b, "es"));
}

function subcategoriesForCategory(category) {
  const key = supplierKey(category);
  if (!key || key === "all") return ALL_SUBCATEGORIES;
  return CATEGORY_SUBCATEGORIES[key] || [];
}

function getSubcategoryOptions(category, products = state.products) {
  const configured = subcategoriesForCategory(category);
  const existing = products
    .filter((product) => category === "all" || product.category === category)
    .map((product) => product.subcategory)
    .filter(Boolean);
  return uniqueLabels([...configured, ...existing]).sort((a, b) => a.localeCompare(b, "es"));
}

function renderLinkedSubcategorySelect(select, category, products = state.products) {
  if (!select) return;
  const current = select.value || "all";
  const subcategories = getSubcategoryOptions(category, products);
  select.innerHTML = `<option value="all">Todas las subcategorias</option>`;
  subcategories.forEach((subcategory) => {
    const option = document.createElement("option");
    option.value = subcategory;
    option.textContent = subcategory;
    select.append(option);
  });
  select.value = subcategories.includes(current) ? current : "all";
}

function matchesCategoryAndSubcategory(product, category, subcategory) {
  const categoryMatch = category === "all" || product.category === category;
  const subcategoryMatch = subcategory === "all" || product.subcategory === subcategory;
  return categoryMatch && subcategoryMatch;
}

function renderMetrics() {
  const products = state.products;
  const totalUnits = products.reduce((sum, product) => sum + Number(product.stock), 0);
  const totalValue = products.reduce((sum, product) => sum + Number(product.stock) * Number(product.price), 0);
  const categories = new Set(products.map((product) => product.category));
  const lowStock = products.filter((product) => product.stock <= product.minStock).length;

  document.querySelector("#metricProducts").textContent = products.length;
  document.querySelector("#metricUnits").textContent = totalUnits;
  document.querySelector("#metricValue").textContent = formatter.format(totalValue);
  document.querySelector("#metricLowStock").textContent = lowStock;
  document.querySelector("#metricProductsHint").textContent = `${categories.size} categorias activas`;
}

function renderCategoryFilter() {
  const current = els.categoryFilter.value;
  const categories = getCategoryOptions();
  els.categoryFilter.innerHTML = `<option value="all">Todas las categorias</option>`;
  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    els.categoryFilter.append(option);
  });
  els.categoryFilter.value = categories.includes(current) ? current : "all";
}

function renderSubcategoryFilter() {
  const current = els.subcategoryFilter.value;
  const selectedCategory = els.categoryFilter.value;
  const subcategories = getSubcategoryOptions(selectedCategory);
  els.subcategoryFilter.innerHTML = `<option value="all">Todas las subcategorias</option>`;
  subcategories.forEach((subcategory) => {
    const option = document.createElement("option");
    option.value = subcategory;
    option.textContent = subcategory;
    els.subcategoryFilter.append(option);
  });
  els.subcategoryFilter.value = subcategories.includes(current) ? current : "all";
}

function renderProducts() {
  const products = filteredProducts();
  els.productRows.innerHTML = "";

  if (!products.length) {
    els.productRows.innerHTML = `
      <tr>
        <td colspan="8">
          <div class="empty-state">No hay productos que coincidan con los filtros.</div>
        </td>
      </tr>`;
    return;
  }

  products.forEach((product) => {
    const status = getStockStatus(product);
    const stockCell = isAdmin()
      ? `
        <div class="stock-control">
          <button type="button" title="Uso rapido" data-action="adjust" data-id="${product.id}" data-amount="-1">−</button>
          <strong>${product.stock}</strong>
          <button type="button" title="Entrada" data-action="adjust" data-id="${product.id}" data-amount="1">+</button>
        </div>`
      : `<strong>${product.stock}</strong>`;
    const actionsCell = isAdmin()
      ? `
        <div class="row-actions">
          <button type="button" title="Ficha rapida" data-action="quick-view" data-id="${product.id}">Ficha</button>
          <button type="button" title="Uso detallado" data-action="detailed-exit" data-id="${product.id}">Uso</button>
          <button type="button" title="Editar" data-action="edit" data-id="${product.id}">✎</button>
          <button type="button" title="Eliminar" data-action="delete" data-id="${product.id}">×</button>
        </div>`
      : canManageStock()
      ? `
        <div class="row-actions">
          <button type="button" title="Ficha rapida" data-action="quick-view" data-id="${product.id}">Ficha</button>
          <button type="button" title="Avisar agotado" data-action="report-empty" data-id="${product.id}">Avisar agotado</button>
        </div>`
      : `
        <div class="row-actions">
          <button type="button" title="Ficha rapida" data-action="quick-view" data-id="${product.id}">Ficha</button>
          <button type="button" title="Avisar agotado" data-action="report-empty" data-id="${product.id}">Avisar agotado</button>
        </div>`;
    const row = document.createElement("tr");
    row.innerHTML = `
      <td data-label="Producto">
        <div class="product-cell">
          <span class="product-avatar">${initials(product.name)}</span>
          <div>
            <strong>${escapeHtml(product.name)}</strong>
            <small>${escapeHtml(product.sku || "Sin codigo")}</small>
          </div>
        </div>
      </td>
      <td data-label="Cantidad">${stockCell}</td>
      <td data-label="Descripcion">${escapeHtml(product.description || "Sin descripcion")}</td>
      <td data-label="Categoria"><strong>${escapeHtml(product.category)}</strong></td>
      <td data-label="Subcategoria">${escapeHtml(product.subcategory || "Sin subcategoria")}</td>
      <td data-label="Precio">${formatter.format(product.price)}</td>
      <td data-label="Estado"><span class="badge ${status.key}">${status.label}</span></td>
      <td data-label="Acciones">${actionsCell}</td>
    `;
    els.productRows.append(row);
  });

  els.productRows.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", handleRowAction);
  });
}

function renderAlerts() {
  const smartAlerts = isAdmin() ? state.smartAlerts : [];

  els.alertList.innerHTML = "";
  if (els.smartAlertCount) {
    els.smartAlertCount.textContent = `${smartAlerts.length} alertas`;
  }

  if (smartAlerts.length) {
    smartAlerts.slice(0, 8).forEach((alert) => {
      const item = document.createElement("article");
      item.className = "alert-item";
      item.innerHTML = `
        <div>
          <strong>${escapeHtml(alert.productName)} <span class="badge ${smartAlertBadge(alert.severity)}">${escapeHtml(alert.label)}</span></strong>
          <small>${escapeHtml(alert.sku)} · ${escapeHtml(formatCategoryPath(alert))} · ${escapeHtml(alert.message)}</small>
        </div>
        <span class="badge ${alert.severity === "critical" ? "out" : alert.severity === "high" ? "low" : "ok"}">${alert.stock}/${alert.minStock}</span>
      `;
      els.alertList.append(item);
    });
    return;
  }

  const products = state.products
    .filter((product) => product.stock <= product.minStock)
    .sort((a, b) => a.stock - b.stock);

  if (!products.length) {
    els.alertList.innerHTML = `<div class="empty-state">Sin alertas por ahora.</div>`;
    return;
  }

  products.slice(0, 6).forEach((product) => {
    const missing = Math.max(product.minStock * 2 - product.stock, 1);
    const item = document.createElement("article");
    item.className = "alert-item";
    item.innerHTML = `
      <div>
        <strong>${escapeHtml(product.name)}</strong>
        <small>${escapeHtml(product.sku)} · ${escapeHtml(formatCategoryPath(product))} · faltan ${missing} sugeridos</small>
      </div>
      <span class="badge ${getStockStatus(product).key}">${product.stock}/${product.minStock}</span>
    `;
    els.alertList.append(item);
  });
}

function renderAdminAlerts() {
  if (!els.adminAlertSection || !isAdmin()) return;

  const alerts = state.stockAlerts.filter((alert) => alert.status === "open");
  els.adminAlertCount.textContent = `${alerts.length} abiertos`;
  els.adminAlertList.innerHTML = "";

  if (!alerts.length) {
    els.adminAlertList.innerHTML = `<div class="empty-state">No hay avisos pendientes de usuarios.</div>`;
    return;
  }

  alerts.forEach((alert) => {
    const item = document.createElement("article");
    item.className = "alert-item";
    item.innerHTML = `
      <div>
        <strong>${escapeHtml(alert.productName)}</strong>
        <small>${escapeHtml(alert.message)} · ${escapeHtml(alert.createdByName || "Usuario")} · ${formatDate(alert.createdAt)}</small>
      </div>
      <button class="ghost-button" type="button" data-action="resolve-alert" data-id="${alert.id}">Marcar atendido</button>
    `;
    els.adminAlertList.append(item);
  });

  els.adminAlertList.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", resolveStockAlert);
  });
}

async function resolveStockAlert(event) {
  if (!requireAdmin()) return;
  const id = event.currentTarget.dataset.id;
  const response = await window.Auth.apiFetch(`/api/stock-alerts/${id}/resolve`, { method: "PATCH" });
  const payload = await response.json();
  if (!response.ok) {
    showToast(payload.error || "No se pudo atender el aviso.");
    return;
  }
  await loadRemoteData();
  render();
  showToast("Aviso marcado como atendido.");
}

function renderMovementTypeFilter() {
  if (!els.movementTypeFilter) return;
  const current = els.movementTypeFilter.value;
  const types = [...new Set(state.movements.map((movement) => movement.movementType).filter(Boolean))].sort();
  els.movementTypeFilter.innerHTML = `<option value="all">Todos los tipos</option>`;
  types.forEach((type) => {
    const option = document.createElement("option");
    option.value = type;
    option.textContent = movementTypeLabels[type] || type;
    els.movementTypeFilter.append(option);
  });
  els.movementTypeFilter.value = types.includes(current) ? current : "all";
}

function renderMovements() {
  els.movementTimeline.innerHTML = "";
  const typeFilter = els.movementTypeFilter?.value || "all";
  const movements = [...state.movements]
    .filter((movement) => typeFilter === "all" || movement.movementType === typeFilter)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  if (!movements.length) {
    els.movementTimeline.innerHTML = `<div class="empty-state">No hay movimientos para este filtro.</div>`;
    return;
  }

  movements.slice(0, 60).forEach((movement) => {
    const item = document.createElement("article");
    item.className = "timeline-item";
    const sign = movement.quantity > 0 ? "+" : "";
    const valueText = movement.totalValue !== null ? ` · valor ${formatter.format(movement.totalValue)}` : "";
    const costText = movement.totalCost !== null ? ` · costo ${formatter.format(movement.totalCost)}` : "";
    item.innerHTML = `
      <div>
        <strong>
          ${escapeHtml(movement.productName)}
          <span class="badge ${movement.quantity > 0 ? "ok" : "low"}">${sign}${movement.quantity}</span>
          <span class="badge movement-type">${escapeHtml(movement.movementTypeLabel || "Movimiento")}</span>
        </strong>
        <small>${escapeHtml(movement.sku)} · ${escapeHtml(movement.note)} · ${formatDate(movement.createdAt)}${valueText}${costText}</small>
      </div>
    `;
    els.movementTimeline.append(item);
  });
}

function setDefaultReportDates() {
  const now = new Date();
  const today = formatDateInput(now);
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const firstDayValue = formatDateInput(firstDay);
  if (els.reportStart && els.reportEnd) {
    els.reportStart.value = firstDayValue;
    els.reportEnd.value = today;
  }
  if (els.exitStart && els.exitEnd) {
    els.exitStart.value = firstDayValue;
    els.exitEnd.value = today;
  }
  if (els.comparisonStart && els.comparisonEnd) {
    els.comparisonStart.value = firstDayValue;
    els.comparisonEnd.value = today;
  }
  if (els.purchaseStart && els.purchaseEnd) {
    els.purchaseStart.value = firstDayValue;
    els.purchaseEnd.value = today;
  }
  if (els.profitStart && els.profitEnd) {
    els.profitStart.value = firstDayValue;
    els.profitEnd.value = today;
  }
}

function reportQueryString() {
  const params = new URLSearchParams({
    from: els.reportStart.value,
    to: els.reportEnd.value
  });
  return params.toString();
}

function exitQueryString() {
  const params = new URLSearchParams({
    from: els.exitStart.value,
    to: els.exitEnd.value
  });
  return params.toString();
}

function comparisonQueryString() {
  const params = new URLSearchParams({
    from: els.comparisonStart.value,
    to: els.comparisonEnd.value
  });
  return params.toString();
}

function purchaseQueryString() {
  const params = new URLSearchParams({
    from: els.purchaseStart.value,
    to: els.purchaseEnd.value
  });
  if (els.purchaseReportCategory?.value && els.purchaseReportCategory.value !== "all") {
    params.set("category", els.purchaseReportCategory.value);
  }
  if (els.purchaseReportProduct?.value && els.purchaseReportProduct.value !== "all") {
    params.set("productId", els.purchaseReportProduct.value);
  }
  return params.toString();
}

function profitQueryString() {
  const params = new URLSearchParams({
    from: els.profitStart.value,
    to: els.profitEnd.value
  });
  return params.toString();
}

function renderPurchaseOptions() {
  if (!els.purchaseProduct || !els.purchaseProductOptions) return;
  const selected = els.purchaseProduct.value;
  renderPurchaseCategoryOptions();
  renderPurchaseReportCategoryOptions();

  const selectedCategory = els.purchaseCategory.value;
  renderLinkedSubcategorySelect(els.purchaseSubcategory, selectedCategory);
  const selectedSubcategory = els.purchaseSubcategory.value;
  const products = [...state.products]
    .filter((product) => matchesCategoryAndSubcategory(product, selectedCategory, selectedSubcategory))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  if (products.some((product) => product.id === selected)) {
    const product = products.find((item) => item.id === selected);
    els.purchaseProductSearch.value = purchaseProductOptionLabel(product);
  } else {
    els.purchaseProduct.value = "";
    els.purchaseProductSearch.value = "";
  }

  renderPurchaseSupplierOptions();
  updatePurchaseMeasureOptions();
  renderPurchaseReportProductFilter();
}

function purchaseProductOptionLabel(product) {
  return `${product.name} · ${product.sku} · ${formatCategoryPath(product)} · ${formatUnits(product.stock)}`;
}

function syncPurchaseProductFromSearch() {
  syncProductSearch("purchase");
  fillPurchaseDefaults();
}

function syncBulkPurchaseProductFromSearch() {
  syncProductSearch("bulkPurchase");
  fillBulkPurchaseDefaults();
}

function syncBulkExitProductFromSearch() {
  syncProductSearch("bulkExit");
  fillBulkExitDefaults();
}

function productAutocompleteConfig(kind) {
  if (kind === "purchase") {
    return {
      input: els.purchaseProductSearch,
      hidden: els.purchaseProduct,
      list: els.purchaseProductOptions,
      label: purchaseProductOptionLabel,
      getProducts: getPurchaseAutocompleteProducts,
      afterSelect: fillPurchaseDefaults
    };
  }

  if (kind === "bulkPurchase") {
    return {
      input: els.bulkPurchaseProductSearch,
      hidden: els.bulkPurchaseProduct,
      list: els.bulkPurchaseProductOptions,
      label: purchaseProductOptionLabel,
      getProducts: getBulkPurchaseAutocompleteProducts,
      afterSelect: fillBulkPurchaseDefaults
    };
  }

  if (kind === "bulkExit") {
    return {
      input: els.bulkExitProductSearch,
      hidden: els.bulkExitProduct,
      list: els.bulkExitProductOptions,
      label: exitProductOptionLabel,
      getProducts: getBulkExitAutocompleteProducts,
      afterSelect: fillBulkExitDefaults
    };
  }

  return {
    input: els.exitProductSearch,
    hidden: els.exitProduct,
    list: els.exitProductOptions,
    label: exitProductOptionLabel,
    getProducts: getExitAutocompleteProducts,
    afterSelect: fillExitRegisterDefaults
  };
}

function normalizeProductSearch(value) {
  return normalizeSearch(value)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function productAutocompleteText(product) {
  return normalizeProductSearch([
    product.name,
    product.sku,
    product.description,
    product.category,
    product.subcategory,
    product.supplier
  ].join(" "));
}

function productMatchesSearch(product, query) {
  const terms = normalizeProductSearch(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const text = productAutocompleteText(product);
  return terms.every((term) => text.includes(term));
}

function productSearchRank(product, query) {
  const text = normalizeProductSearch(query);
  if (!text) return 0;

  const name = normalizeProductSearch(product.name);
  const sku = normalizeProductSearch(product.sku);
  const category = normalizeProductSearch(formatCategoryPath(product));
  if (name.startsWith(text)) return 0;
  if (sku.startsWith(text)) return 1;
  if (name.includes(text)) return 2;
  if (sku.includes(text)) return 3;
  if (category.includes(text)) return 4;
  return 5;
}

function sortAutocompleteProducts(products, query) {
  return products.sort((a, b) => {
    const rank = productSearchRank(a, query) - productSearchRank(b, query);
    return rank || a.name.localeCompare(b.name, "es");
  });
}

function getPurchaseAutocompleteProducts(query = "") {
  const selectedCategory = els.purchaseCategory.value;
  const selectedSubcategory = els.purchaseSubcategory.value || "all";
  const products = state.products
    .filter((product) => matchesCategoryAndSubcategory(product, selectedCategory, selectedSubcategory))
    .filter((product) => productMatchesSearch(product, query));
  return sortAutocompleteProducts(products, query);
}

function getExitAutocompleteProducts(query = "") {
  const selectedCategory = els.exitCategory.value;
  const selectedSubcategory = els.exitSubcategory.value || "all";
  const products = state.products
    .filter((product) => Number(product.stock) > 0)
    .filter((product) => matchesCategoryAndSubcategory(product, selectedCategory, selectedSubcategory))
    .filter((product) => productMatchesSearch(product, query));
  return sortAutocompleteProducts(products, query);
}

function getBulkPurchaseAutocompleteProducts(query = "") {
  const selectedCategory = els.bulkPurchaseCategory.value;
  const selectedSubcategory = els.bulkPurchaseSubcategory.value || "all";
  const products = state.products
    .filter((product) => matchesCategoryAndSubcategory(product, selectedCategory, selectedSubcategory))
    .filter((product) => productMatchesSearch(product, query));
  return sortAutocompleteProducts(products, query);
}

function getBulkExitAutocompleteProducts(query = "") {
  const selectedCategory = els.bulkExitCategory.value;
  const selectedSubcategory = els.bulkExitSubcategory.value || "all";
  const products = state.products
    .filter((product) => Number(product.stock) > 0)
    .filter((product) => matchesCategoryAndSubcategory(product, selectedCategory, selectedSubcategory))
    .filter((product) => productMatchesSearch(product, query));
  return sortAutocompleteProducts(products, query);
}

function findExactAutocompleteProduct(kind) {
  const config = productAutocompleteConfig(kind);
  const query = normalizeProductSearch(config.input.value);
  if (!query) return null;

  return config.getProducts("").find((product) => (
    normalizeProductSearch(config.label(product)) === query
      || normalizeProductSearch(product.name) === query
      || normalizeProductSearch(product.sku) === query
  )) || null;
}

function syncProductSearch(kind) {
  const config = productAutocompleteConfig(kind);
  const exactProduct = findExactAutocompleteProduct(kind);
  config.hidden.value = exactProduct?.id || "";
  renderProductSuggestions(kind);
}

function renderProductSuggestions(kind) {
  const config = productAutocompleteConfig(kind);
  if (!config.input || !config.list) return;

  const query = config.input.value.trim();
  const products = config.getProducts(query).slice(0, PRODUCT_SUGGESTION_LIMIT);
  const suggestionState = productSuggestionState[kind];
  suggestionState.products = products;
  suggestionState.activeIndex = -1;
  config.input.setAttribute("aria-expanded", "true");
  config.list.innerHTML = "";

  if (!products.length) {
    config.list.innerHTML = `<div class="product-suggestion-empty">Sin productos encontrados</div>`;
    config.list.hidden = false;
    return;
  }

  products.forEach((product, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "product-suggestion";
    button.dataset.index = index;
    button.id = `${kind}ProductSuggestion${index}`;
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", "false");
    button.innerHTML = `
      <span class="product-suggestion-name">${escapeHtml(product.name)}</span>
      <span class="product-suggestion-meta">${escapeHtml(product.sku)} &middot; ${escapeHtml(formatCategoryPath(product))} &middot; ${escapeHtml(formatUnits(product.stock))}</span>
    `;
    config.list.append(button);
  });
  config.list.hidden = false;
}

function closeProductSuggestions(kind) {
  const config = productAutocompleteConfig(kind);
  if (!config.input || !config.list) return;
  config.list.hidden = true;
  config.input.setAttribute("aria-expanded", "false");
  config.input.removeAttribute("aria-activedescendant");
  productSuggestionState[kind].activeIndex = -1;
}

function closeProductSuggestionsSoon(kind) {
  setTimeout(() => {
    if (!document.activeElement?.closest(".product-autocomplete")) {
      closeProductSuggestions(kind);
    }
  }, 0);
}

function setProductSuggestionActive(kind, index) {
  const config = productAutocompleteConfig(kind);
  const suggestionState = productSuggestionState[kind];
  const buttons = [...config.list.querySelectorAll(".product-suggestion")];
  if (!buttons.length) return;

  const nextIndex = (index + buttons.length) % buttons.length;
  suggestionState.activeIndex = nextIndex;
  buttons.forEach((button, buttonIndex) => {
    const isActive = buttonIndex === nextIndex;
    button.setAttribute("aria-selected", String(isActive));
    if (isActive) {
      config.input.setAttribute("aria-activedescendant", button.id);
      button.scrollIntoView({ block: "nearest" });
    }
  });
}

function selectProductSuggestion(kind, index) {
  const config = productAutocompleteConfig(kind);
  const product = productSuggestionState[kind].products[index];
  if (!product) return;

  config.hidden.value = product.id;
  config.input.value = config.label(product);
  closeProductSuggestions(kind);
  config.afterSelect(product);
}

function handleProductSuggestionClick(kind, event) {
  const button = event.target.closest(".product-suggestion");
  if (!button) return;
  selectProductSuggestion(kind, Number(button.dataset.index));
}

function handleProductSearchKeydown(kind, event) {
  const config = productAutocompleteConfig(kind);
  const suggestionState = productSuggestionState[kind];
  const isOpen = config.list && !config.list.hidden;

  if (event.key === "ArrowDown") {
    event.preventDefault();
    if (!isOpen) renderProductSuggestions(kind);
    setProductSuggestionActive(kind, suggestionState.activeIndex + 1);
    return;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    if (!isOpen) renderProductSuggestions(kind);
    setProductSuggestionActive(kind, suggestionState.activeIndex - 1);
    return;
  }

  if (event.key === "Enter" && isOpen && suggestionState.products.length) {
    event.preventDefault();
    selectProductSuggestion(kind, suggestionState.activeIndex >= 0 ? suggestionState.activeIndex : 0);
    return;
  }

  if (event.key === "Escape") {
    closeProductSuggestions(kind);
  }
}

function renderPurchaseCategoryOptions() {
  if (!els.purchaseCategory) return;
  const current = els.purchaseCategory.value || "all";
  const categories = getCategoryOptions();
  els.purchaseCategory.innerHTML = `<option value="all">Todas las categorias</option>`;
  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    els.purchaseCategory.append(option);
  });
  els.purchaseCategory.value = categories.includes(current) ? current : "all";
}

function renderPurchaseReportCategoryOptions() {
  if (!els.purchaseReportCategory) return;
  const current = els.purchaseReportCategory.value || "all";
  const categories = getCategoryOptions();
  els.purchaseReportCategory.innerHTML = `<option value="all">Todas las categorias</option>`;
  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    els.purchaseReportCategory.append(option);
  });
  els.purchaseReportCategory.value = categories.includes(current) ? current : "all";
}

function renderPurchaseReportProductFilter() {
  if (!els.purchaseReportProduct) return;
  const current = els.purchaseReportProduct.value || "all";
  const selectedCategory = els.purchaseReportCategory.value || "all";
  const products = [...state.products]
    .filter((product) => selectedCategory === "all" || product.category === selectedCategory)
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  els.purchaseReportProduct.innerHTML = `<option value="all">Todos los productos</option>`;
  products.forEach((product) => {
    const option = document.createElement("option");
    option.value = product.id;
    option.textContent = `${product.name} · ${product.sku}`;
    els.purchaseReportProduct.append(option);
  });
  els.purchaseReportProduct.value = products.some((product) => product.id === current) ? current : "all";
}

function fillPurchaseDefaults() {
  const product = state.products.find((item) => item.id === els.purchaseProduct.value);
  if (!product) {
    renderPurchaseSupplierOptions();
    updatePurchaseMeasureOptions();
    els.purchaseUnitCost.value = "";
    updatePurchaseTotal();
    return;
  }

  renderPurchaseSupplierOptions(product.supplier || els.purchaseSupplier.value);
  updatePurchaseMeasureOptions();
  els.purchaseUnitCost.value = Number(product.cost || 0).toFixed(2);
  if (!els.purchaseQuantity.value) els.purchaseQuantity.value = 1;
  updatePurchaseTotal();
}

function updatePurchaseTotal() {
  if (!els.purchaseTotal) return;
  const quantity = Number(els.purchaseQuantity.value || 0);
  const unitCost = measuredUnitPrice(
    Number(els.purchaseUnitCost.value || 0),
    selectedMeasureUnitValue(els.purchaseMeasureUnit)
  );
  const total = Number.isFinite(quantity) && Number.isFinite(unitCost) ? quantity * unitCost : 0;
  els.purchaseTotal.textContent = formatter.format(Math.max(total, 0));
}

function supplierKey(value) {
  return normalizeSearch(value).replace(/\s+/g, " ");
}

function uniqueSuppliers(suppliers) {
  const seen = new Set();
  return suppliers.reduce((items, supplier) => {
    const clean = String(supplier || "").trim().replace(/\s+/g, " ");
    const key = supplierKey(clean);
    if (!clean || seen.has(key)) return items;
    seen.add(key);
    items.push(clean);
    return items;
  }, []);
}

function suppliersForCategory(category) {
  const key = supplierKey(category);
  if (!key || key === "all") return ALL_SUPPLIERS;
  return CATEGORY_SUPPLIERS[key] || DEFAULT_SUPPLIERS;
}

function selectedSupplierCategory(categoryValue, productId) {
  if (categoryValue && categoryValue !== "all") return categoryValue;
  const product = state.products.find((item) => item.id === productId);
  return product?.category || "all";
}

function renderSupplierSelect(select, category, preferredValue) {
  if (!select) return;
  const suppliers = suppliersForCategory(category);
  const current = preferredValue || select.value;
  const currentKey = supplierKey(current);
  select.innerHTML = "";
  suppliers.forEach((supplier) => {
    const option = document.createElement("option");
    option.value = supplier;
    option.textContent = supplier;
    select.append(option);
  });
  const selected = suppliers.find((supplier) => supplierKey(supplier) === currentKey);
  select.value = selected || suppliers[0] || "";
}

function isMeatLabel(value) {
  return normalizeSearch(value) === "carne";
}

function isMeatProduct(product) {
  return Boolean(product && (isMeatLabel(product.category) || isMeatLabel(product.subcategory)));
}

function isMeatContext(category, subcategory, product) {
  return isMeatProduct(product) || isMeatLabel(category) || isMeatLabel(subcategory);
}

function ensureCustomMeasureInput(select) {
  if (!select?.id) return null;

  const inputId = `${select.id}Custom`;
  let input = document.querySelector(`#${inputId}`);
  if (input) return input;

  input = document.createElement("input");
  input.id = inputId;
  input.type = "text";
  input.className = "custom-measure-input";
  input.placeholder = "Ej. 750 g, 2 kg";
  input.maxLength = 40;
  input.autocomplete = "off";
  input.hidden = true;
  input.addEventListener("input", () => handleCustomMeasureChange(select));
  select.insertAdjacentElement("afterend", input);
  return input;
}

function syncCustomMeasureInput(select, shouldFocus = false) {
  const input = ensureCustomMeasureInput(select);
  if (!input) return;

  const isCustom = select.value === MEAT_CUSTOM_MEASURE_VALUE;
  input.hidden = !isCustom;
  input.required = isCustom;
  if (!isCustom) input.value = "";
  if (isCustom && shouldFocus) input.focus();
}

function selectedMeasureUnitValue(select) {
  if (!select) return "Pieza";
  if (select.value !== MEAT_CUSTOM_MEASURE_VALUE) return select.value || "Pieza";
  return String(ensureCustomMeasureInput(select)?.value || "").trim();
}

function hasInvalidCustomMeatMeasure(select) {
  return select?.value === MEAT_CUSTOM_MEASURE_VALUE && !measureUnitKgFactor(selectedMeasureUnitValue(select));
}

function measureUnitKgFactor(value) {
  const text = normalizeSearch(value).replace(",", ".");
  const fraction = text.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*kg$/);
  if (fraction) {
    const numerator = Number(fraction[1]);
    const denominator = Number(fraction[2]);
    return denominator > 0 ? numerator / denominator : null;
  }

  const kilograms = text.match(/^(\d+(?:\.\d+)?)\s*(kg|kilo|kilos|kilogramo|kilogramos)$/);
  if (kilograms) return Number(kilograms[1]);

  const grams = text.match(/^(\d+(?:\.\d+)?)\s*(g|gr|gramo|gramos)$/);
  if (grams) return Number(grams[1]) / 1000;

  const plainNumber = text.match(/^(\d+(?:\.\d+)?)$/);
  if (plainNumber) return Number(plainNumber[1]) / 1000;

  return null;
}

function measuredUnitPrice(basePrice, measureUnit) {
  const price = Number(basePrice || 0);
  const factor = measureUnitKgFactor(measureUnit);
  return Number.isFinite(price) && factor && factor > 0 ? Number((price * factor).toFixed(2)) : price;
}

function handleMeasureUnitChange(select) {
  syncCustomMeasureInput(select, true);
  handleCustomMeasureChange(select);
}

function handleCustomMeasureChange(select) {
  if (select === els.purchaseMeasureUnit) updatePurchaseTotal();
  if (select === els.exitMeasureUnit) updateExitStockPreview();
}

function toggleQuantityField(input, isMeat) {
  if (!input) return;
  const label = input.closest("label");
  if (label) label.hidden = Boolean(isMeat);
  input.required = !isMeat;
  if (isMeat) input.value = 1;
}

function updatePurchaseQuantityVisibility() {
  const product = state.products.find((item) => item.id === els.purchaseProduct.value);
  toggleQuantityField(
    els.purchaseQuantity,
    isMeatContext(els.purchaseCategory.value, els.purchaseSubcategory.value, product)
  );
}

function updateBulkPurchaseQuantityVisibility() {
  const product = state.products.find((item) => item.id === els.bulkPurchaseProduct.value);
  toggleQuantityField(
    els.bulkPurchaseQuantity,
    isMeatContext(els.bulkPurchaseCategory.value, els.bulkPurchaseSubcategory.value, product)
  );
}

function updateExitQuantityVisibility() {
  const product = state.products.find((item) => item.id === els.exitProduct.value);
  toggleQuantityField(
    els.exitRegisterQuantity,
    isMeatContext(els.exitCategory.value, els.exitSubcategory.value, product)
  );
}

function updateBulkExitQuantityVisibility() {
  const product = state.products.find((item) => item.id === els.bulkExitProduct.value);
  toggleQuantityField(
    els.bulkExitQuantity,
    isMeatContext(els.bulkExitCategory.value, els.bulkExitSubcategory.value, product)
  );
}

function renderMeasureUnitOptions(select, isMeat, preferredValue) {
  if (!select) return;

  const customInput = ensureCustomMeasureInput(select);
  const current = preferredValue || selectedMeasureUnitValue(select);
  const currentKey = normalizeSearch(current);
  const options = isMeat
    ? [
        ...MEAT_MEASURE_UNITS.map((unit) => ({ value: unit, label: unit })),
        { value: MEAT_CUSTOM_MEASURE_VALUE, label: "Otra cantidad" }
      ]
    : STANDARD_MEASURE_UNITS.map((unit) => ({ value: unit, label: unit }));

  select.innerHTML = "";
  options.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = item.label;
    select.append(option);
  });

  if (isMeat) {
    const exact = MEAT_MEASURE_UNITS.find((unit) => normalizeSearch(unit) === currentKey);
    if (exact) {
      select.value = exact;
      if (customInput) customInput.value = "";
    } else if (current && current !== MEAT_CUSTOM_MEASURE_VALUE && current !== "Pieza") {
      select.value = MEAT_CUSTOM_MEASURE_VALUE;
      if (customInput) customInput.value = current;
    } else {
      select.value = "1 kg";
      if (customInput) customInput.value = "";
    }
  } else {
    const exact = STANDARD_MEASURE_UNITS.find((unit) => normalizeSearch(unit) === currentKey);
    select.value = exact || "Pieza";
    if (customInput) customInput.value = "";
  }

  syncCustomMeasureInput(select);
}

function updatePurchaseMeasureOptions(preferredValue) {
  const product = state.products.find((item) => item.id === els.purchaseProduct.value);
  renderMeasureUnitOptions(
    els.purchaseMeasureUnit,
    isMeatContext(els.purchaseCategory.value, els.purchaseSubcategory.value, product),
    preferredValue
  );
  updatePurchaseQuantityVisibility();
}

function updateBulkPurchaseMeasureOptions(preferredValue) {
  const product = state.products.find((item) => item.id === els.bulkPurchaseProduct.value);
  renderMeasureUnitOptions(
    els.bulkPurchaseMeasureUnit,
    isMeatContext(els.bulkPurchaseCategory.value, els.bulkPurchaseSubcategory.value, product),
    preferredValue
  );
  updateBulkPurchaseQuantityVisibility();
}

function updateExitMeasureOptions(preferredValue) {
  const product = state.products.find((item) => item.id === els.exitProduct.value);
  renderMeasureUnitOptions(
    els.exitMeasureUnit,
    isMeatContext(els.exitCategory.value, els.exitSubcategory.value, product),
    preferredValue
  );
  updateExitQuantityVisibility();
}

function updateBulkExitMeasureOptions(preferredValue) {
  const product = state.products.find((item) => item.id === els.bulkExitProduct.value);
  renderMeasureUnitOptions(
    els.bulkExitMeasureUnit,
    isMeatContext(els.bulkExitCategory.value, els.bulkExitSubcategory.value, product),
    preferredValue
  );
  updateBulkExitQuantityVisibility();
}

function updateExitModalMeasureOptions(product, preferredValue) {
  renderMeasureUnitOptions(els.exitModalMeasureUnit, isMeatProduct(product), preferredValue);
}

function renderPurchaseSupplierOptions(preferredValue) {
  const category = selectedSupplierCategory(els.purchaseCategory.value, els.purchaseProduct.value);
  renderSupplierSelect(els.purchaseSupplier, category, preferredValue);
}

function renderBulkPurchaseSupplierOptions(preferredValue) {
  const category = selectedSupplierCategory(els.bulkPurchaseCategory.value, els.bulkPurchaseProduct.value);
  renderSupplierSelect(els.bulkPurchaseSupplier, category, preferredValue);
}

function renderExitSupplierOptions(preferredValue) {
  const category = selectedSupplierCategory(els.exitCategory.value, els.exitProduct.value);
  renderSupplierSelect(els.exitSupplierType, category, preferredValue);
}

function renderBulkExitSupplierOptions(preferredValue) {
  const category = selectedSupplierCategory(els.bulkExitCategory.value, els.bulkExitProduct.value);
  renderSupplierSelect(els.bulkExitSupplierType, category, preferredValue);
}

function normalizePurchaseSupplier(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function openBulkPurchaseModal() {
  if (!requireStockAccess()) return;
  renderBulkPurchaseCategoryOptions();
  renderLinkedSubcategorySelect(els.bulkPurchaseSubcategory, els.bulkPurchaseCategory.value);
  renderBulkPurchaseProductOptions();
  renderBulkPurchaseItems();
  updateBulkPurchaseMeasureOptions();
  els.bulkPurchaseModal.classList.add("active");
  els.bulkPurchaseModal.setAttribute("aria-hidden", "false");
}

function closeBulkPurchaseModal() {
  closeProductSuggestions("bulkPurchase");
  els.bulkPurchaseModal.classList.remove("active");
  els.bulkPurchaseModal.setAttribute("aria-hidden", "true");
}

function renderBulkPurchaseCategoryOptions() {
  if (!els.bulkPurchaseCategory) return;
  const current = els.bulkPurchaseCategory.value || "all";
  const categories = getCategoryOptions();
  els.bulkPurchaseCategory.innerHTML = `<option value="all">Todas las categorias</option>`;
  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    els.bulkPurchaseCategory.append(option);
  });
  els.bulkPurchaseCategory.value = categories.includes(current) ? current : "all";
}

function renderBulkPurchaseProductOptions() {
  if (!els.bulkPurchaseProduct) return;
  const selected = els.bulkPurchaseProduct.value;
  const selectedCategory = els.bulkPurchaseCategory.value;
  const selectedSubcategory = els.bulkPurchaseSubcategory.value || "all";
  const products = [...state.products]
    .filter((product) => matchesCategoryAndSubcategory(product, selectedCategory, selectedSubcategory))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  if (products.some((product) => product.id === selected)) {
    const product = products.find((item) => item.id === selected);
    els.bulkPurchaseProductSearch.value = purchaseProductOptionLabel(product);
  } else {
    els.bulkPurchaseProduct.value = "";
    els.bulkPurchaseProductSearch.value = "";
  }
  renderBulkPurchaseSupplierOptions();
  updateBulkPurchaseMeasureOptions();
}

function fillBulkPurchaseDefaults() {
  const product = state.products.find((item) => item.id === els.bulkPurchaseProduct.value);
  if (!product) {
    renderBulkPurchaseSupplierOptions();
    updateBulkPurchaseMeasureOptions();
    els.bulkPurchaseUnitCost.value = "";
    return;
  }
  renderBulkPurchaseSupplierOptions(product.supplier || els.bulkPurchaseSupplier.value);
  updateBulkPurchaseMeasureOptions();
  els.bulkPurchaseUnitCost.value = Number(product.cost || 0).toFixed(2);
  if (!els.bulkPurchaseQuantity.value) els.bulkPurchaseQuantity.value = 1;
}

function addBulkPurchaseItem() {
  const product = state.products.find((item) => item.id === els.bulkPurchaseProduct.value);
  const quantity = Number(els.bulkPurchaseQuantity.value);
  const baseUnitCost = Number(els.bulkPurchaseUnitCost.value);

  if (!product) {
    showToast("Selecciona un producto para agregarlo.");
    return;
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    showToast("Captura una cantidad entera mayor a cero.");
    return;
  }

  if (!Number.isFinite(baseUnitCost) || baseUnitCost < 0) {
    showToast("Captura un costo unitario valido.");
    return;
  }

  const measureUnit = selectedMeasureUnitValue(els.bulkPurchaseMeasureUnit);
  if (!measureUnit) {
    showToast("Captura la unidad de medida.");
    return;
  }
  if (hasInvalidCustomMeatMeasure(els.bulkPurchaseMeasureUnit)) {
    showToast("Escribe la otra cantidad en gramos o kilos, por ejemplo 750 g.");
    return;
  }

  const unitCost = measuredUnitPrice(baseUnitCost, measureUnit);
  const existing = bulkPurchaseItems.find((item) => item.productId === product.id);
  if (existing) {
    if ((existing.measureUnit || "Pieza") !== measureUnit) {
      showToast("Ese producto ya esta en la lista con otra unidad.");
      return;
    }
    existing.quantity += quantity;
    existing.unitCost = unitCost;
  } else {
    bulkPurchaseItems.push({
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      category: product.category,
      subcategory: product.subcategory || "",
      stock: Number(product.stock || 0),
      measureUnit,
      quantity,
      unitCost
    });
  }

  els.bulkPurchaseProduct.value = "";
  els.bulkPurchaseProductSearch.value = "";
  els.bulkPurchaseQuantity.value = "";
  els.bulkPurchaseUnitCost.value = "";
  closeProductSuggestions("bulkPurchase");
  updateBulkPurchaseMeasureOptions();
  renderBulkPurchaseItems();
  showToast("Producto agregado a la entrada grande.");
}

function renderBulkPurchaseItems() {
  if (!els.bulkPurchaseItems) return;
  const total = bulkPurchaseItems.reduce((sum, item) => sum + (Number(item.quantity) * Number(item.unitCost)), 0);
  const units = bulkPurchaseItems.reduce((sum, item) => sum + Number(item.quantity), 0);
  els.bulkPurchaseCount.textContent = String(bulkPurchaseItems.length);
  els.bulkPurchaseTotal.textContent = `${formatter.format(total)} · ${formatUnits(units)}`;

  if (!bulkPurchaseItems.length) {
    els.bulkPurchaseItems.innerHTML = `<div class="empty-state">Aun no hay productos en la entrada grande.</div>`;
    return;
  }

  els.bulkPurchaseItems.innerHTML = bulkPurchaseItems.map((item, index) => `
    <article class="bulk-purchase-item bulk-purchase-entry-item">
      <div>
        <strong>${escapeHtml(item.productName)}</strong>
        <small>${escapeHtml(item.sku)} · ${escapeHtml(formatCategoryPath(item))} · stock actual ${formatUnits(item.stock)}</small>
      </div>
      <label>
        Cantidad
        <input type="number" min="1" step="1" value="${item.quantity}" data-bulk-index="${index}" data-bulk-field="quantity" />
      </label>
      <div>
        <strong>${escapeHtml(item.measureUnit || "Pieza")}</strong>
        <small>Unidad</small>
      </div>
      <label>
        Costo
        <input type="number" min="0" step="0.01" value="${Number(item.unitCost).toFixed(2)}" data-bulk-index="${index}" data-bulk-field="unitCost" />
      </label>
      <button class="icon-button" type="button" title="Quitar producto" data-bulk-remove="${index}">×</button>
    </article>
  `).join("");
}

function handleBulkPurchaseItems(event) {
  const removeIndex = event.target.closest("[data-bulk-remove]")?.dataset.bulkRemove;
  if (removeIndex !== undefined) {
    bulkPurchaseItems.splice(Number(removeIndex), 1);
    renderBulkPurchaseItems();
    return;
  }

  const input = event.target.closest("[data-bulk-index][data-bulk-field]");
  if (!input) return;

  const index = Number(input.dataset.bulkIndex);
  const field = input.dataset.bulkField;
  const item = bulkPurchaseItems[index];
  if (!item) return;

  const value = Number(input.value);
  if (field === "quantity") {
    item.quantity = Number.isInteger(value) && value > 0 ? value : item.quantity;
  }
  if (field === "unitCost") {
    item.unitCost = Number.isFinite(value) && value >= 0 ? value : item.unitCost;
  }
  renderBulkPurchaseItems();
}

function syncBulkPurchaseItemsFromInputs() {
  let valid = true;
  els.bulkPurchaseItems.querySelectorAll("[data-bulk-index][data-bulk-field]").forEach((input) => {
    const index = Number(input.dataset.bulkIndex);
    const field = input.dataset.bulkField;
    const item = bulkPurchaseItems[index];
    if (!item) return;

    const value = Number(input.value);
    if (field === "quantity") {
      if (Number.isInteger(value) && value > 0) {
        item.quantity = value;
      } else {
        valid = false;
      }
    }
    if (field === "unitCost") {
      if (Number.isFinite(value) && value >= 0) {
        item.unitCost = value;
      } else {
        valid = false;
      }
    }
  });
  return valid;
}

async function saveBulkPurchase() {
  if (!requireStockAccess()) return;
  if (!bulkPurchaseItems.length) {
    showToast("Agrega al menos un producto a la entrada grande.");
    return;
  }
  if (!syncBulkPurchaseItemsFromInputs()) {
    showToast("Revisa cantidades y costos de la lista.");
    return;
  }

  const purchase = {
    supplier: normalizePurchaseSupplier(els.bulkPurchaseSupplier.value),
    note: els.bulkPurchaseNote.value.trim(),
    items: bulkPurchaseItems.map((item) => ({
      productId: item.productId,
      measureUnit: item.measureUnit || "Pieza",
      quantity: item.quantity,
      unitCost: item.unitCost
    }))
  };

  const response = await window.Auth.apiFetch("/api/purchases/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(purchase)
  });
  const payload = await response.json();
  if (!response.ok) {
    showToast(payload.error || "No se pudo guardar la entrada grande.");
    return;
  }

  bulkPurchaseItems = [];
  els.bulkPurchaseNote.value = "";
  renderBulkPurchaseSupplierOptions();
  closeBulkPurchaseModal();
  await loadRemoteData();
  await loadPurchaseReport();
  state.incomeReport = null;
  state.exitReport = null;
  state.comparisonReport = null;
  render();
  showToast(`Entrada grande registrada: ${payload.summary?.totalEntries || 0} productos.`);
}

function openBulkExitModal() {
  if (!requireStockAccess()) return;
  renderBulkExitCategoryOptions();
  renderLinkedSubcategorySelect(
    els.bulkExitSubcategory,
    els.bulkExitCategory.value,
    state.products.filter((product) => Number(product.stock) > 0)
  );
  renderBulkExitProductOptions();
  renderBulkExitItems();
  updateBulkExitMeasureOptions();
  els.bulkExitModal.classList.add("active");
  els.bulkExitModal.setAttribute("aria-hidden", "false");
}

function closeBulkExitModal() {
  closeProductSuggestions("bulkExit");
  els.bulkExitModal.classList.remove("active");
  els.bulkExitModal.setAttribute("aria-hidden", "true");
}

function renderBulkExitCategoryOptions() {
  if (!els.bulkExitCategory) return;
  const current = els.bulkExitCategory.value || "all";
  const categories = getCategoryOptions(state.products.filter((product) => Number(product.stock) > 0));

  els.bulkExitCategory.innerHTML = `<option value="all">Todas las categorias</option>`;
  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    els.bulkExitCategory.append(option);
  });
  els.bulkExitCategory.value = categories.includes(current) ? current : "all";
}

function renderBulkExitProductOptions() {
  if (!els.bulkExitProduct) return;
  const selected = els.bulkExitProduct.value;
  const selectedCategory = els.bulkExitCategory.value;
  const selectedSubcategory = els.bulkExitSubcategory.value || "all";
  const products = [...state.products]
    .filter((product) => Number(product.stock) > 0)
    .filter((product) => matchesCategoryAndSubcategory(product, selectedCategory, selectedSubcategory))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  if (products.some((product) => product.id === selected)) {
    const product = products.find((item) => item.id === selected);
    els.bulkExitProductSearch.value = exitProductOptionLabel(product);
  } else {
    els.bulkExitProduct.value = "";
    els.bulkExitProductSearch.value = "";
  }
  renderBulkExitSupplierOptions();
  updateBulkExitMeasureOptions();
}

function fillBulkExitDefaults() {
  const product = state.products.find((item) => item.id === els.bulkExitProduct.value);
  if (!product) {
    renderBulkExitSupplierOptions();
    updateBulkExitMeasureOptions();
    els.bulkExitQuantity.removeAttribute("max");
    return;
  }
  renderBulkExitSupplierOptions(product.supplier || els.bulkExitSupplierType.value);
  updateBulkExitMeasureOptions();
  if (!els.bulkExitQuantity.value) els.bulkExitQuantity.value = 1;
  els.bulkExitQuantity.max = String(product.stock);
}

function addBulkExitItem() {
  const product = state.products.find((item) => item.id === els.bulkExitProduct.value);
  const quantity = Number(els.bulkExitQuantity.value);

  if (!product) {
    showToast("Selecciona un producto para agregarlo.");
    return;
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    showToast("Captura una cantidad entera mayor a cero.");
    return;
  }

  if (quantity > Number(product.stock)) {
    showToast("No hay suficiente stock para ese producto.");
    return;
  }

  const existing = bulkExitItems.find((item) => item.productId === product.id);
  const measureUnit = selectedMeasureUnitValue(els.bulkExitMeasureUnit);
  if (!measureUnit) {
    showToast("Captura la unidad de medida.");
    return;
  }
  if (hasInvalidCustomMeatMeasure(els.bulkExitMeasureUnit)) {
    showToast("Escribe la otra cantidad en gramos o kilos, por ejemplo 750 g.");
    return;
  }
  const price = measuredUnitPrice(product.price, measureUnit);
  const nextQuantity = existing ? existing.quantity + quantity : quantity;
  if (nextQuantity > Number(product.stock)) {
    showToast("La lista supera el stock disponible de ese producto.");
    return;
  }

  if (existing) {
    if ((existing.measureUnit || "Pieza") !== measureUnit) {
      showToast("Ese producto ya esta en la lista con otra unidad.");
      return;
    }
    existing.quantity = nextQuantity;
  } else {
    bulkExitItems.push({
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      category: product.category,
      subcategory: product.subcategory || "",
      stock: Number(product.stock || 0),
      price,
      measureUnit,
      quantity
    });
  }

  els.bulkExitProduct.value = "";
  els.bulkExitProductSearch.value = "";
  els.bulkExitQuantity.value = "";
  els.bulkExitQuantity.removeAttribute("max");
  closeProductSuggestions("bulkExit");
  updateBulkExitMeasureOptions();
  renderBulkExitItems();
  showToast("Producto agregado a la salida grande.");
}

function renderBulkExitItems() {
  if (!els.bulkExitItems) return;
  const units = bulkExitItems.reduce((sum, item) => sum + Number(item.quantity), 0);
  els.bulkExitCount.textContent = String(bulkExitItems.length);
  els.bulkExitTotal.textContent = formatUnits(units);

  if (!bulkExitItems.length) {
    els.bulkExitItems.innerHTML = `<div class="empty-state">Aun no hay productos en la salida grande.</div>`;
    return;
  }

  els.bulkExitItems.innerHTML = bulkExitItems.map((item, index) => `
    <article class="bulk-purchase-item bulk-purchase-entry-item">
      <div>
        <strong>${escapeHtml(item.productName)}</strong>
        <small>${escapeHtml(item.sku)} · ${escapeHtml(formatCategoryPath(item))} · stock disponible ${formatUnits(item.stock)}</small>
      </div>
      <label>
        Cantidad
        <input type="number" min="1" max="${item.stock}" step="1" value="${item.quantity}" data-bulk-exit-index="${index}" />
      </label>
      <div>
        <strong>${escapeHtml(item.measureUnit || "Pieza")}</strong>
        <small>Unidad</small>
      </div>
      <div>
        <strong>${formatter.format(item.price * item.quantity)}</strong>
        <small>Valor estimado</small>
      </div>
      <button class="icon-button" type="button" title="Quitar producto" data-bulk-exit-remove="${index}">×</button>
    </article>
  `).join("");
}

function handleBulkExitItems(event) {
  const removeIndex = event.target.closest("[data-bulk-exit-remove]")?.dataset.bulkExitRemove;
  if (removeIndex !== undefined) {
    bulkExitItems.splice(Number(removeIndex), 1);
    renderBulkExitItems();
    return;
  }

  const input = event.target.closest("[data-bulk-exit-index]");
  if (!input) return;

  const index = Number(input.dataset.bulkExitIndex);
  const item = bulkExitItems[index];
  if (!item) return;

  const value = Number(input.value);
  if (Number.isInteger(value) && value > 0 && value <= item.stock) {
    item.quantity = value;
    renderBulkExitItems();
  } else {
    showToast("La cantidad debe ser valida y no superar el stock.");
    input.value = item.quantity;
  }
}

function syncBulkExitItemsFromInputs() {
  let valid = true;
  els.bulkExitItems.querySelectorAll("[data-bulk-exit-index]").forEach((input) => {
    const index = Number(input.dataset.bulkExitIndex);
    const item = bulkExitItems[index];
    if (!item) return;

    const value = Number(input.value);
    if (Number.isInteger(value) && value > 0 && value <= item.stock) {
      item.quantity = value;
    } else {
      valid = false;
    }
  });
  return valid;
}

async function saveBulkExit() {
  if (!requireStockAccess()) return;
  if (!bulkExitItems.length) {
    showToast("Agrega al menos un producto a la salida grande.");
    return;
  }
  if (!syncBulkExitItemsFromInputs()) {
    showToast("Revisa las cantidades de la lista.");
    return;
  }

  const movementType = els.bulkExitMovementType.value;
  const payload = {
    movementType,
    supplierType: els.bulkExitSupplierType.value,
    note: els.bulkExitNote.value.trim() || exitTypeNotes[movementType] || "Uso en cocina",
    items: bulkExitItems.map((item) => ({
      productId: item.productId,
      measureUnit: item.measureUnit || "Pieza",
      quantity: item.quantity
    }))
  };

  const response = await window.Auth.apiFetch("/api/exits/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const result = await response.json();
  if (!response.ok) {
    showToast(result.error || "No se pudo guardar la salida grande.");
    return;
  }

  bulkExitItems = [];
  els.bulkExitNote.value = exitTypeNotes[els.bulkExitMovementType.value] || "Uso en cocina";
  closeBulkExitModal();
  await loadRemoteData();
  state.exitReport = null;
  state.incomeReport = null;
  state.profitReport = null;
  state.comparisonReport = null;
  render();
  resetExitRegisterForm();
  await loadExitReport();
  showToast(`Salida grande registrada: ${result.summary?.totalEntries || 0} productos.`);
}

function renderExitOptions() {
  if (!els.exitProductOptions) return;
  const selected = els.exitProduct.value;
  renderExitCategoryOptions();

  const selectedCategory = els.exitCategory.value;
  renderLinkedSubcategorySelect(
    els.exitSubcategory,
    selectedCategory,
    state.products.filter((product) => Number(product.stock) > 0)
  );
  const selectedSubcategory = els.exitSubcategory.value || "all";
  const products = [...state.products]
    .filter((product) => Number(product.stock) > 0)
    .filter((product) => matchesCategoryAndSubcategory(product, selectedCategory, selectedSubcategory))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  if (products.some((product) => product.id === selected)) {
    const product = products.find((item) => item.id === selected);
    els.exitProductSearch.value = exitProductOptionLabel(product);
  } else {
    els.exitProduct.value = "";
    els.exitProductSearch.value = "";
  }
  renderExitSupplierOptions();
  fillExitRegisterDefaults();
}

function renderExitCategoryOptions() {
  if (!els.exitCategory) return;
  const current = els.exitCategory.value || "all";
  const categories = getCategoryOptions();
  els.exitCategory.innerHTML = `<option value="all">Todas las categorias</option>`;
  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    els.exitCategory.append(option);
  });
  els.exitCategory.value = categories.includes(current) ? current : "all";
}

function exitProductOptionLabel(product) {
  const category = formatCategoryPath(product);
  return `${product.name} · ${product.sku} · ${category} · ${formatUnits(product.stock)}`;
}

function syncExitProductFromSearch() {
  syncProductSearch("exit");
  fillExitRegisterDefaults();
}

function fillExitRegisterDefaults() {
  const product = state.products.find((item) => item.id === els.exitProduct.value);
  renderExitSupplierOptions(product?.supplier || els.exitSupplierType.value);
  updateExitMeasureOptions();
  if (!els.exitRegisterQuantity.value) els.exitRegisterQuantity.value = product ? 1 : "";
  if (!els.exitRegisterNote.value) els.exitRegisterNote.value = exitTypeNotes[els.exitRegisterMovementType.value] || "Uso en cocina";
  if (product) {
    els.exitRegisterQuantity.max = String(product.stock);
  } else {
    els.exitRegisterQuantity.removeAttribute("max");
  }
  updateExitStockPreview();
}

function updateExitStockPreview() {
  const product = state.products.find((item) => item.id === els.exitProduct.value);
  if (!product) {
    els.exitStockPreview.textContent = "-";
    return;
  }

  const quantity = Number(els.exitRegisterQuantity.value || 0);
  const measureUnit = selectedMeasureUnitValue(els.exitMeasureUnit);
  const unitValue = measuredUnitPrice(product.price, measureUnit);
  const factor = measureUnitKgFactor(measureUnit);
  const estimated = Number.isFinite(quantity) && quantity > 0 && factor
    ? ` Â· valor estimado ${formatter.format(unitValue * quantity)}`
    : "";
  els.exitStockPreview.textContent = `${formatUnits(product.stock)}${estimated}`;
}

function resetExitRegisterForm() {
  els.exitRegisterForm.reset();
  els.exitCategory.value = "all";
  els.exitSubcategory.value = "all";
  closeProductSuggestions("exit");
  renderExitOptions();
  fillExitRegisterDefaults();
}

function resetPurchaseForm() {
  els.purchaseForm.reset();
  els.purchaseCategory.value = "all";
  els.purchaseSubcategory.value = "all";
  closeProductSuggestions("purchase");
  renderPurchaseOptions();
  updatePurchaseTotal();
}

async function loadPurchaseReport() {
  if (!requireStockAccess()) return;
  if (!els.purchaseStart.value || !els.purchaseEnd.value) {
    showToast("Selecciona fecha inicial y final.");
    return;
  }

  const response = await window.Auth.apiFetch(`/api/purchases?${purchaseQueryString()}`);
  const payload = await response.json();
  if (!response.ok) {
    showToast(payload.error || "No se pudieron cargar las compras.");
    return;
  }

  state.purchaseReport = payload;
  renderPurchaseOptions();
  renderPurchaseReport();
}

function renderPurchaseReport() {
  if (!els.purchaseRows) return;
  const report = state.purchaseReport;
  const summary = report?.summary || { totalCost: 0, totalUnits: 0, totalEntries: 0, totalSuppliers: 0 };

  els.purchaseTotalCost.textContent = formatter.format(summary.totalCost || 0);
  els.purchaseUnits.textContent = summary.totalUnits || 0;
  els.purchaseEntries.textContent = summary.totalEntries || 0;
  els.purchaseSuppliers.textContent = summary.totalSuppliers || 0;
  els.purchaseRows.innerHTML = "";

  if (!canManageStock()) {
    els.purchaseRows.innerHTML = `
      <tr>
        <td colspan="10">
          <div class="empty-state">Tu usuario no puede registrar ni consultar entradas.</div>
        </td>
      </tr>`;
    return;
  }

  if (!report) {
    els.purchaseRows.innerHTML = `
      <tr>
        <td colspan="10">
          <div class="empty-state">Genera un reporte para ver las compras del periodo.</div>
        </td>
      </tr>`;
    return;
  }

  if (!report.rows.length) {
    els.purchaseRows.innerHTML = `
      <tr>
        <td colspan="10">
          <div class="empty-state">No hay compras registradas en este rango de fechas.</div>
        </td>
      </tr>`;
    return;
  }

  report.rows.forEach((purchase) => {
    const row = document.createElement("tr");
    row.className = "mobile-collapsible-row";
    row.innerHTML = `
      <td class="mobile-row-summary" colspan="10">
        <button class="mobile-row-toggle" type="button" data-action="toggle-purchase-row" aria-expanded="false" aria-label="Ver detalle de ${escapeHtml(purchase.productName)}">
          <span>
            <strong>${escapeHtml(purchase.productName)}</strong>
            <small>${formatDate(purchase.createdAt)} · ${escapeHtml(purchase.supplier)}</small>
          </span>
          <span class="mobile-row-total">
            <strong>${formatter.format(purchase.totalCost)}</strong>
            <small>${escapeHtml(formatMeasureQuantity(purchase.quantity, purchase.measureUnit))}</small>
          </span>
          <span class="mobile-row-chevron" aria-hidden="true">⌄</span>
        </button>
      </td>
      <td data-label="Fecha">${formatDate(purchase.createdAt)}</td>
      <td data-label="Producto">${escapeHtml(purchase.productName)}</td>
      <td data-label="Categoria">${escapeHtml(formatCategoryPath(purchase))}</td>
      <td data-label="Proveedor">${escapeHtml(purchase.supplier)}</td>
      <td data-label="Cantidad">${purchase.quantity}</td>
      <td data-label="Unidad">${escapeHtml(purchase.measureUnit || "Pieza")}</td>
      <td data-label="Costo">${formatter.format(purchase.unitCost)}</td>
      <td data-label="Total">${formatter.format(purchase.totalCost)}</td>
      <td data-label="Usuario">${escapeHtml(purchase.createdByName)}</td>
      <td data-label="Acciones">
        ${isAdmin()
          ? `<button class="ghost-button table-edit-button" type="button" data-action="edit-purchase" data-id="${purchase.id}">Editar</button>`
          : `<span class="readonly-note">Solo lectura</span>`}
      </td>
    `;
    els.purchaseRows.append(row);
  });

  els.purchaseRows.querySelectorAll("[data-action='toggle-purchase-row']").forEach((button) => {
    button.addEventListener("click", () => {
      const row = button.closest("tr");
      const expanded = row.classList.toggle("expanded");
      button.setAttribute("aria-expanded", String(expanded));
    });
  });
  els.purchaseRows.querySelectorAll("[data-action='edit-purchase']").forEach((button) => {
    button.addEventListener("click", () => openEditPurchaseModal(button.dataset.id));
  });
}

function openEditPurchaseModal(purchaseId) {
  if (!requireAdmin()) return;
  const purchase = state.purchaseReport?.rows.find((item) => item.id === purchaseId);
  if (!purchase) {
    showToast("No se encontro la entrada seleccionada.");
    return;
  }

  els.editPurchaseForm.reset();
  els.editPurchaseId.value = purchase.id;
  els.editPurchaseSubtitle.textContent = `${purchase.productName} · ${formatDate(purchase.createdAt)} · Registrado por ${purchase.createdByName}`;
  els.editPurchaseSupplier.value = purchase.supplier || "";
  els.editPurchaseQuantity.value = purchase.quantity;
  renderMeasureUnitOptions(
    els.editPurchaseMeasureUnit,
    isMeatContext(purchase.category, purchase.subcategory, purchase),
    purchase.measureUnit || "Pieza"
  );
  els.editPurchaseUnitCost.value = purchase.unitCost;
  els.editPurchaseNote.value = purchase.note || "";
  els.editPurchaseModal.classList.add("active");
  els.editPurchaseModal.setAttribute("aria-hidden", "false");
  els.editPurchaseQuantity.focus();
}

function closeEditPurchaseModal() {
  els.editPurchaseModal.classList.remove("active");
  els.editPurchaseModal.setAttribute("aria-hidden", "true");
}

async function saveEditedPurchase(event) {
  event.preventDefault();
  if (!requireAdmin()) return;

  const purchase = {
    supplier: els.editPurchaseSupplier.value.trim(),
    quantity: Number(els.editPurchaseQuantity.value),
    measureUnit: selectedMeasureUnitValue(els.editPurchaseMeasureUnit),
    unitCost: Number(els.editPurchaseUnitCost.value),
    note: els.editPurchaseNote.value.trim()
  };
  if (!purchase.supplier || !Number.isInteger(purchase.quantity) || purchase.quantity <= 0) {
    showToast("Captura un proveedor y una cantidad valida.");
    return;
  }
  if (!purchase.measureUnit) {
    showToast("Captura la unidad de medida.");
    return;
  }
  if (hasInvalidCustomMeatMeasure(els.editPurchaseMeasureUnit)) {
    showToast("Escribe la otra cantidad en gramos o kilos, por ejemplo 750 g.");
    return;
  }
  if (!Number.isFinite(purchase.unitCost) || purchase.unitCost < 0) {
    showToast("Captura un costo unitario valido.");
    return;
  }

  const response = await window.Auth.apiFetch(`/api/purchases/${els.editPurchaseId.value}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(purchase)
  });
  const payload = await response.json();
  if (!response.ok) {
    showToast(payload.error || "No se pudo editar la entrada.");
    return;
  }

  closeEditPurchaseModal();
  state.incomeReport = null;
  state.exitReport = null;
  state.comparisonReport = null;
  state.profitReport = null;
  await loadRemoteData();
  await loadPurchaseReport();
  render();
  showToast("Entrada actualizada y stock corregido.");
}

async function deleteEditedPurchase() {
  if (!requireAdmin()) return;

  const purchaseId = els.editPurchaseId.value;
  if (!purchaseId) {
    showToast("No se encontro la entrada seleccionada.");
    return;
  }

  if (!confirm("Borrar esta entrada? Se corregira el stock y se eliminara el movimiento asociado.")) return;

  const response = await window.Auth.apiFetch(`/api/purchases/${purchaseId}`, { method: "DELETE" });
  const payload = await response.json();
  if (!response.ok) {
    showToast(payload.error || "No se pudo borrar la entrada.");
    return;
  }

  closeEditPurchaseModal();
  state.incomeReport = null;
  state.exitReport = null;
  state.comparisonReport = null;
  state.profitReport = null;
  await loadRemoteData();
  await loadPurchaseReport();
  render();
  showToast("Entrada borrada y stock corregido.");
}

async function savePurchaseFromForm(event) {
  event.preventDefault();
  if (!requireStockAccess()) return;

  const formData = new FormData(els.purchaseForm);

  const productId = formData.get("productId");
  const product = state.products.find((item) => item.id === productId);
  const measureUnit = selectedMeasureUnitValue(els.purchaseMeasureUnit);
  const isMeatPurchase = isMeatContext(els.purchaseCategory.value, els.purchaseSubcategory.value, product);
  const quantity = isMeatPurchase ? 1 : Number(formData.get("quantity"));


  const purchase = {
    productId,
    measureUnit,
    supplier: formData.get("supplier").trim(),

    quantity,
    unitCost: Number(formData.get("unitCost")),
    note: formData.get("note").trim()
  };

  if (!purchase.productId || !purchase.supplier || !Number.isFinite(purchase.quantity) || purchase.quantity <= 0) {
    showToast("Selecciona producto, proveedor y cantidad válida.");
    return;
  }
  if (!purchase.measureUnit) {
    showToast("Captura la unidad de medida.");
    return;
  }
  if (hasInvalidCustomMeatMeasure(els.purchaseMeasureUnit)) {
    showToast("Escribe la otra cantidad en gramos o kilos, por ejemplo 750 g.");
    return;
  }

  if (!Number.isFinite(purchase.unitCost) || purchase.unitCost < 0) {
    showToast("Captura un costo unitario valido.");
    return;
  }
  purchase.unitCost = measuredUnitPrice(purchase.unitCost, purchase.measureUnit);

  const response = await window.Auth.apiFetch("/api/purchases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(purchase)
  });
  const payload = await response.json();
  if (!response.ok) {
    showToast(payload.error || "No se pudo registrar la compra.");
    return;
  }

  resetPurchaseForm();
  await loadRemoteData();
  await loadPurchaseReport();
  state.incomeReport = null;
  state.exitReport = null;
  state.comparisonReport = null;
  render();
  showToast("Entrada registrada y stock actualizado.");
  switchPanel("entries");
}

async function downloadPurchaseReport() {
  if (!requireStockAccess()) return;
  if (!els.purchaseStart.value || !els.purchaseEnd.value) {
    showToast("Selecciona fecha inicial y final.");
    return;
  }

  const response = await window.Auth.apiFetch(`/api/purchases.xlsx?${purchaseQueryString()}`);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    showToast(payload.error || "No se pudo descargar el reporte de compras.");
    return;
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `reporte-compras-${els.purchaseStart.value}-a-${els.purchaseEnd.value}.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
  showToast("Reporte de compras descargado.");
}

async function loadIncomeReport() {
  if (!requireAdmin()) return;
  if (!els.reportStart.value || !els.reportEnd.value) {
    showToast("Selecciona fecha inicial y final.");
    return;
  }

  const response = await window.Auth.apiFetch(`/api/reports/income?${reportQueryString()}`);
  const payload = await response.json();
  if (!response.ok) {
    showToast(payload.error || "No se pudo generar el reporte.");
    return;
  }

  state.incomeReport = payload;
  renderIncomeReport();
}

function renderIncomeReport() {
  if (!els.incomeReportRows) return;
  const report = state.incomeReport;
  const summary = report?.summary || { totalIncome: 0, totalUnits: 0, totalMovements: 0 };

  els.reportIncome.textContent = formatter.format(summary.totalIncome || 0);
  els.reportUnits.textContent = summary.totalUnits || 0;
  els.reportMovements.textContent = summary.totalMovements || 0;
  els.reportRange.textContent = report ? `${report.range.from} / ${report.range.to}` : "-";
  els.incomeReportRows.innerHTML = "";

  if (!isAdmin()) {
    els.incomeReportRows.innerHTML = `
      <tr>
        <td colspan="8">
          <div class="empty-state">Solo admin puede consultar reportes de ingresos.</div>
        </td>
      </tr>`;
    return;
  }

  if (!report) {
    els.incomeReportRows.innerHTML = `
      <tr>
        <td colspan="8">
          <div class="empty-state">Genera un reporte para ver los ingresos del periodo.</div>
        </td>
      </tr>`;
    return;
  }

  if (!report.rows.length) {
    els.incomeReportRows.innerHTML = `
      <tr>
        <td colspan="8">
          <div class="empty-state">No hay ingresos registrados en este rango de fechas.</div>
        </td>
      </tr>`;
    return;
  }

  report.rows.forEach((item) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td data-label="Fecha">${formatDate(item.date)}</td>
      <td data-label="Producto">${escapeHtml(item.productName)}</td>
      <td data-label="SKU">${escapeHtml(item.sku)}</td>
      <td data-label="Categoria">${escapeHtml(formatCategoryPath(item))}</td>
      <td data-label="Cantidad">${item.unitsSold}</td>
      <td data-label="Precio">${formatter.format(item.unitPrice)}</td>
      <td data-label="Total">${formatter.format(item.total)}</td>
      <td data-label="Usuario">${escapeHtml(item.userName)}</td>
    `;
    els.incomeReportRows.append(row);
  });
}

async function downloadIncomeReport() {
  if (!requireAdmin()) return;
  if (!els.reportStart.value || !els.reportEnd.value) {
    showToast("Selecciona fecha inicial y final.");
    return;
  }

  const response = await window.Auth.apiFetch(`/api/reports/income.xlsx?${reportQueryString()}`);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    showToast(payload.error || "No se pudo descargar el reporte.");
    return;
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `reporte-ingresos-${els.reportStart.value}-a-${els.reportEnd.value}.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
  showToast("Reporte de ingresos descargado.");
}

async function downloadCategoryExcel() {
  try {
    const category = els.categoryFilter.value;

    const response = await window.Auth.apiFetch(
      `/api/reports/products.xlsx?category=${encodeURIComponent(category)}`
    );

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      showToast(payload.error || "No se pudo descargar el Excel.");
      return;
    }

    const blob = await response.blob();

    const url = URL.createObjectURL(blob);

    const anchor = document.createElement("a");

    anchor.href = url;

    anchor.download =
      category && category !== "all"
        ? `inventario-${category}.xlsx`
        : "inventario-completo.xlsx";

    anchor.click();

    URL.revokeObjectURL(url);

    showToast("Excel descargado correctamente.");
  } catch (error) {
    console.error(error);
    showToast("Error al descargar Excel.");
  }
}


async function loadProfitReport() {
  if (!requireAdmin()) return;
  if (!els.profitStart.value || !els.profitEnd.value) {
    showToast("Selecciona fecha inicial y final.");
    return;
  }

  const response = await window.Auth.apiFetch(`/api/reports/profit?${profitQueryString()}`);
  const payload = await response.json();
  if (!response.ok) {
    showToast(payload.error || "No se pudo generar el reporte de utilidad.");
    return;
  }

  state.profitReport = payload;
  renderProfitReport();
}

function renderProfitReport() {
  if (!els.profitRows) return;
  const report = state.profitReport;
  const summary = report?.summary || { totalIncome: 0, totalCost: 0, totalProfit: 0, margin: 0 };

  els.profitIncome.textContent = formatter.format(summary.totalIncome || 0);
  els.profitCost.textContent = formatter.format(summary.totalCost || 0);
  els.profitGain.textContent = formatter.format(summary.totalProfit || 0);
  els.profitMargin.textContent = `${percentFormatter.format(summary.margin || 0)}%`;
  els.profitRows.innerHTML = "";

  if (!isAdmin()) {
    els.profitRows.innerHTML = `
      <tr>
        <td colspan="10">
          <div class="empty-state">Solo admin puede consultar reportes de utilidad.</div>
        </td>
      </tr>`;
    return;
  }

  if (!report) {
    els.profitRows.innerHTML = `
      <tr>
        <td colspan="10">
          <div class="empty-state">Genera un reporte para ver utilidad por producto.</div>
        </td>
      </tr>`;
    return;
  }

  if (!report.rows.length) {
    els.profitRows.innerHTML = `
      <tr>
        <td colspan="10">
          <div class="empty-state">No hay usos de insumos registrados en este rango de fechas.</div>
        </td>
      </tr>`;
    return;
  }

  report.rows.forEach((item) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td data-label="Producto">${escapeHtml(item.productName)}</td>
      <td data-label="SKU">${escapeHtml(item.sku)}</td>
      <td data-label="Categoria">${escapeHtml(formatCategoryPath(item))}</td>
      <td data-label="Unidades">${item.unitsSold}</td>
      <td data-label="Precio prom.">${formatter.format(item.averagePrice)}</td>
      <td data-label="Costo prom.">${formatter.format(item.averageCost)}</td>
      <td data-label="Ingreso">${formatter.format(item.income)}</td>
      <td data-label="Costo">${formatter.format(item.cost)}</td>
      <td data-label="Ganancia">${formatter.format(item.profit)}</td>
      <td data-label="Margen">${percentFormatter.format(item.margin)}%</td>
    `;
    els.profitRows.append(row);
  });
}

async function downloadProfitReport() {
  if (!requireAdmin()) return;
  if (!els.profitStart.value || !els.profitEnd.value) {
    showToast("Selecciona fecha inicial y final.");
    return;
  }

  const response = await window.Auth.apiFetch(`/api/reports/profit.xlsx?${profitQueryString()}`);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    showToast(payload.error || "No se pudo descargar el reporte de utilidad.");
    return;
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `reporte-utilidad-${els.profitStart.value}-a-${els.profitEnd.value}.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
  showToast("Reporte de utilidad descargado.");
}

async function loadExitReport() {
  if (!requireStockAccess()) return;
  if (!els.exitStart.value || !els.exitEnd.value) {
    showToast("Selecciona fecha inicial y final.");
    return;
  }

  const response = await window.Auth.apiFetch(`/api/reports/exits?${exitQueryString()}`);
  const payload = await response.json();
  if (!response.ok) {
    showToast(payload.error || "No se pudieron cargar los usos de insumos.");
    return;
  }

  state.exitReport = payload;
  renderExitReport();
}

async function saveExitFromSection(event) {
  event.preventDefault();
  if (!requireStockAccess()) return;

  const product = state.products.find((item) => item.id === els.exitProduct.value);
  const quantity = Number(els.exitRegisterQuantity.value);
  const movementType = els.exitRegisterMovementType.value;
  const supplierType = els.exitSupplierType.value;
  const measureUnit = selectedMeasureUnitValue(els.exitMeasureUnit);
  const note = els.exitRegisterNote.value.trim() || exitTypeNotes[movementType] || "Uso en cocina";

  if (!product) {
    showToast("Selecciona un producto.");
    return;
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    showToast("Captura una cantidad valida.");
    return;
  }
  if (!measureUnit) {
    showToast("Captura la unidad de medida.");
    return;
  }
  if (hasInvalidCustomMeatMeasure(els.exitMeasureUnit)) {
    showToast("Escribe la otra cantidad en gramos o kilos, por ejemplo 750 g.");
    return;
  }

  if (quantity > Number(product.stock)) {
    showToast("No hay suficiente stock para registrar ese uso.");
    return;
  }

  const response = await window.Auth.apiFetch(`/api/products/${product.id}/exit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quantity, measureUnit, movementType, supplierType, note })
  });
  const payload = await response.json();
  if (!response.ok) {
    showToast(payload.error || "No se pudo registrar el uso de insumo.");
    return;
  }

  const currentPanel = activePanel;

await loadRemoteData();

state.exitReport = null;
state.incomeReport = null;
state.profitReport = null;
state.comparisonReport = null;

render();
resetExitRegisterForm();

await loadExitReport();
switchPanel(currentPanel);
switchPanel("exits");
showToast("Uso de insumo registrado.");
}



function renderExitReport() {
  if (!els.exitReportRows) return;
  const report = state.exitReport;
  const summary = report?.summary || { totalValue: 0, totalUnits: 0, totalMovements: 0 };

  els.exitTotalValue.textContent = formatter.format(summary.totalValue || 0);
  els.exitUnits.textContent = summary.totalUnits || 0;
  els.exitMovements.textContent = summary.totalMovements || 0;
  els.exitRange.textContent = report ? `${report.range.from} / ${report.range.to}` : "-";
  els.exitReportRows.innerHTML = "";

  if (!canManageStock()) {
    els.exitReportRows.innerHTML = `
      <tr>
        <td colspan="12">
          <div class="empty-state">Tu usuario no puede consultar usos de insumos.</div>
        </td>
      </tr>`;
    return;
  }

  if (!report) {
    els.exitReportRows.innerHTML = `
      <tr>
        <td colspan="12">
          <div class="empty-state">Genera un reporte para ver los insumos utilizados del periodo.</div>
        </td>
      </tr>`;
    return;
  }

  if (!report.rows.length) {
    els.exitReportRows.innerHTML = `
      <tr>
        <td colspan="12">
          <div class="empty-state">No hay usos de insumos registrados en este rango de fechas.</div>
        </td>
      </tr>`;
    return;
  }

  report.rows.forEach((item) => {
    const row = document.createElement("tr");
    row.className = "mobile-collapsible-row";
    const movementLabel = item.movementTypeLabel || movementTypeLabels[item.movementType] || "Uso en cocina";
    row.innerHTML = `
      <td class="mobile-row-summary" colspan="12">
        <button class="mobile-row-toggle" type="button" data-action="toggle-exit-row" aria-expanded="false" aria-label="Ver detalle de ${escapeHtml(item.productName)}">
          <span>
            <strong>${escapeHtml(item.productName)}</strong>
            <small>${formatDate(item.date)} · ${escapeHtml(movementLabel)} · ${escapeHtml(item.supplierType || "Proveedor local")}</small>
          </span>
          <span class="mobile-row-total">
            <strong>${formatter.format(item.total)}</strong>
            <small>${escapeHtml(formatMeasureQuantity(item.unitsOut, item.measureUnit))}</small>
          </span>
          <span class="mobile-row-chevron" aria-hidden="true">⌄</span>
        </button>
      </td>
      <td data-label="Fecha">${formatDate(item.date)}</td>
      <td data-label="Producto">${escapeHtml(item.productName)}</td>
      <td data-label="Categoria">${escapeHtml(formatCategoryPath(item))}</td>
      <td data-label="Tipo">${escapeHtml(movementLabel)}</td>
      <td data-label="Proveedor">${escapeHtml(item.supplierType || "Proveedor local")}</td>
      <td data-label="Motivo">${escapeHtml(item.note)}</td>
      <td data-label="Cantidad">${item.unitsOut}</td>
      <td data-label="Unidad">${escapeHtml(item.measureUnit || "Pieza")}</td>
      <td data-label="Precio">${formatter.format(item.unitPrice)}</td>
      <td data-label="Total">${formatter.format(item.total)}</td>
      <td data-label="Usuario">${escapeHtml(item.userName)}</td>
      <td data-label="Acciones">
        ${isAdmin()
          ? `<button class="ghost-button table-edit-button" type="button" data-action="edit-exit" data-id="${item.id}">Editar</button>`
          : `<span class="readonly-note">Solo lectura</span>`}
      </td>
    `;
    els.exitReportRows.append(row);
  });

  els.exitReportRows.querySelectorAll("[data-action='toggle-exit-row']").forEach((button) => {
    button.addEventListener("click", () => {
      const row = button.closest("tr");
      const expanded = row.classList.toggle("expanded");
      button.setAttribute("aria-expanded", String(expanded));
    });
  });
  els.exitReportRows.querySelectorAll("[data-action='edit-exit']").forEach((button) => {
    button.addEventListener("click", () => openEditExitModal(button.dataset.id));
  });
}

function openEditExitModal(exitId) {
  if (!requireAdmin()) return;
  const exit = state.exitReport?.rows.find((item) => item.id === exitId);
  if (!exit) {
    showToast("No se encontro la salida seleccionada.");
    return;
  }

  els.editExitForm.reset();
  els.editExitId.value = exit.id;
  els.editExitSubtitle.textContent = `${exit.productName} · ${formatDate(exit.date)} · Registrado por ${exit.userName}`;
  els.editExitMovementType.value = exit.movementType || "venta";
  els.editExitSupplierType.value = exit.supplierType || "Proveedor local";
  els.editExitQuantity.value = exit.unitsOut;
  renderMeasureUnitOptions(
    els.editExitMeasureUnit,
    isMeatContext(exit.category, exit.subcategory, exit),
    exit.measureUnit || "Pieza"
  );
  els.editExitNote.value = exit.note || exitTypeNotes[exit.movementType] || "Uso en cocina";
  els.editExitModal.classList.add("active");
  els.editExitModal.setAttribute("aria-hidden", "false");
  els.editExitQuantity.focus();
}

function closeEditExitModal() {
  els.editExitModal.classList.remove("active");
  els.editExitModal.setAttribute("aria-hidden", "true");
}

async function saveEditedExit(event) {
  event.preventDefault();
  if (!requireAdmin()) return;

  const exit = {
    movementType: els.editExitMovementType.value,
    supplierType: els.editExitSupplierType.value.trim(),
    quantity: Number(els.editExitQuantity.value),
    measureUnit: selectedMeasureUnitValue(els.editExitMeasureUnit),
    note: els.editExitNote.value.trim()
  };
  if (!exit.supplierType || !Number.isInteger(exit.quantity) || exit.quantity <= 0) {
    showToast("Captura un proveedor y una cantidad valida.");
    return;
  }
  if (!exit.measureUnit) {
    showToast("Captura la unidad de medida.");
    return;
  }
  if (hasInvalidCustomMeatMeasure(els.editExitMeasureUnit)) {
    showToast("Escribe la otra cantidad en gramos o kilos, por ejemplo 750 g.");
    return;
  }

  const response = await window.Auth.apiFetch(`/api/exits/${els.editExitId.value}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(exit)
  });
  const payload = await response.json();
  if (!response.ok) {
    showToast(payload.error || "No se pudo editar la salida.");
    return;
  }

  closeEditExitModal();
  state.incomeReport = null;
  state.purchaseReport = null;
  state.comparisonReport = null;
  state.profitReport = null;
  await loadRemoteData();
  await loadExitReport();
  render();
  showToast("Salida actualizada y stock corregido.");
}

async function downloadExitReport() {
  if (!requireStockAccess()) return;
  if (!els.exitStart.value || !els.exitEnd.value) {
    showToast("Selecciona fecha inicial y final.");
    return;
  }

  const response = await window.Auth.apiFetch(`/api/reports/exits.xlsx?${exitQueryString()}`);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    showToast(payload.error || "No se pudo descargar el reporte de uso de insumos.");
    return;
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `reporte-uso-insumos-${els.exitStart.value}-a-${els.exitEnd.value}.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
  showToast("Reporte de uso de insumos descargado.");
}

async function loadComparisonReport() {
  if (!requireStockAccess()) return;
  if (!els.comparisonStart.value || !els.comparisonEnd.value) {
    showToast("Selecciona fecha inicial y final.");
    return;
  }

  const response = await window.Auth.apiFetch(`/api/reports/stock-comparison?${comparisonQueryString()}`);
  const payload = await response.json();
  if (!response.ok) {
    showToast(payload.error || "No se pudo generar la comparativa.");
    return;
  }

  state.comparisonReport = payload;
  renderComparisonReport();
}

function comparisonStatus(item) {
  if (item.unitsOut > item.unitsIn) return { label: "Se uso mas de lo comprado", key: "low" };
  if (item.currentStock <= 0) return { label: "Sin stock", key: "out" };
  if (item.balanceUnits > 0) return { label: "Quedo disponible", key: "ok" };
  return { label: "Equilibrado", key: "ok" };
}

function renderComparisonReport() {
  if (!els.comparisonRows) return;
  const report = state.comparisonReport;
  const summary = report?.summary || { totalUnitsIn: 0, totalUnitsOut: 0, totalConsumedCost: 0, netUnits: 0 };

  els.comparisonPurchasedUnits.textContent = summary.totalUnitsIn || 0;
  els.comparisonUsedUnits.textContent = summary.totalUnitsOut || 0;
  els.comparisonConsumedCost.textContent = formatter.format(summary.totalConsumedCost || 0);
  els.comparisonNetUnits.textContent = signedNumber(summary.netUnits || 0);
  els.comparisonRows.innerHTML = "";

  if (!canManageStock()) {
    els.comparisonRows.innerHTML = `
      <tr>
        <td colspan="9">
          <div class="empty-state">Tu usuario no puede consultar esta comparativa.</div>
        </td>
      </tr>`;
    return;
  }

  if (!report) {
    els.comparisonRows.innerHTML = `
      <tr>
        <td colspan="9">
          <div class="empty-state">Genera una comparativa para revisar compras contra consumo.</div>
        </td>
      </tr>`;
    return;
  }

  if (!report.rows.length) {
    els.comparisonRows.innerHTML = `
      <tr>
        <td colspan="9">
          <div class="empty-state">No hay entradas ni usos en este rango de fechas.</div>
        </td>
      </tr>`;
    return;
  }

  report.rows.forEach((item) => {
    const status = comparisonStatus(item);
    const row = document.createElement("tr");
    row.innerHTML = `
      <td data-label="Producto">
        <strong>${escapeHtml(item.productName)}</strong>
        <small>${escapeHtml(item.sku || "Sin codigo")}</small>
      </td>
      <td data-label="Categoria">${escapeHtml(formatCategoryPath(item))}</td>
      <td data-label="Stock antes">${item.estimatedStartStock}</td>
      <td data-label="Entradas">${item.unitsIn}</td>
      <td data-label="Usos">${item.unitsOut}</td>
      <td data-label="Saldo">${signedNumber(item.balanceUnits)}</td>
      <td data-label="Gasto">${formatter.format(item.consumedCost)}</td>
      <td data-label="Stock quedo">${item.currentStock}</td>
      <td data-label="Estado"><span class="badge ${status.key}">${escapeHtml(status.label)}</span></td>
    `;
    els.comparisonRows.append(row);
  });
}

async function downloadComparisonReport() {
  if (!requireStockAccess()) return;
  if (!els.comparisonStart.value || !els.comparisonEnd.value) {
    showToast("Selecciona fecha inicial y final.");
    return;
  }

  const response = await window.Auth.apiFetch(`/api/reports/stock-comparison.xlsx?${comparisonQueryString()}`);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    showToast(payload.error || "No se pudo descargar la comparativa.");
    return;
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `comparativa-entradas-usos-${els.comparisonStart.value}-a-${els.comparisonEnd.value}.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
  showToast("Comparativa descargada.");
}

function animateChart() {
  if (!els.chart) return;
  drawCategoryChart();
}

function drawCategoryChart() {
  const totals = categoryTotals();
  const max = Math.max(...totals.map((item) => item.value), 1);
  const colors = ["#156b73", "#d45b3f", "#18805a", "#af7b12", "#536b8f", "#8a5b9f"];

  els.chart.innerHTML = "";

  if (!totals.length) {
    els.chart.innerHTML = `<div class="empty-state">Sin datos para graficar.</div>`;
    return;
  }

  totals.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "category-chart-row";

    const label = document.createElement("span");
    label.className = "category-chart-label";
    label.title = item.category;
    label.textContent = item.category;

    const track = document.createElement("div");
    track.className = "category-chart-track";

    const bar = document.createElement("span");
    bar.className = "category-chart-bar";
    bar.style.background = colors[index % colors.length];
    track.append(bar);

    const value = document.createElement("span");
    value.className = "category-chart-value";
    value.textContent = formatter.format(item.value);

    row.append(label, track, value);
    els.chart.append(row);

    requestAnimationFrame(() => {
      bar.style.width = `${Math.max((item.value / max) * 100, 2)}%`;
    });
  });
}

function categoryTotals() {
  const totals = new Map();
  state.products.forEach((product) => {
    const value = Number(product.stock) * Number(product.price);
    totals.set(product.category, (totals.get(product.category) || 0) + value);
  });
  return [...totals.entries()]
    .map(([category, value]) => ({ category, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
}

function openModal(product) {
  if (!requireLogin()) return;
  if (!requireAdmin()) return;

  els.form.reset();
  document.querySelector("#productId").value = product?.id || "";
  els.modalTitle.textContent = product ? "Editar producto" : "Nuevo producto";

  if (product) {
    Object.entries(product).forEach(([key, value]) => {
      const field = document.querySelector(`#${key}`);
      if (field) field.value = value;
    });
  }

  els.modal.classList.add("active");
  els.modal.setAttribute("aria-hidden", "false");
  document.querySelector("#name").focus();
}

function closeModal() {
  els.modal.classList.remove("active");
  els.modal.setAttribute("aria-hidden", "true");
}

async function openQuickProductModal(product) {
  if (!requireLogin()) return;

  els.quickTitle.textContent = product.name;
  els.quickSubtitle.textContent = `${product.sku || "Sin codigo"} · ${formatCategoryPath(product)}`;
  els.quickBody.innerHTML = `<div class="empty-state">Cargando ficha del producto...</div>`;
  els.quickModal.classList.add("active");
  els.quickModal.setAttribute("aria-hidden", "false");

  try {
    const response = await window.Auth.apiFetch(`/api/products/${product.id}/quick-card`);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      throw new Error("El servidor aun no tiene activa la ficha rapida. Reinicia npm.cmd start.");
    }
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "No se pudo cargar la ficha.");

    els.quickTitle.textContent = payload.product.name;
    els.quickSubtitle.textContent = `${payload.product.sku || "Sin codigo"} · ${formatCategoryPath(payload.product)}`;
    els.quickBody.innerHTML = quickProductCardHtml(payload);
  } catch (error) {
    els.quickBody.innerHTML = `<div class="empty-state">${escapeHtml(error.message || "No se pudo cargar la ficha.")}</div>`;
  }
}

function closeQuickProductModal() {
  els.quickModal.classList.remove("active");
  els.quickModal.setAttribute("aria-hidden", "true");
}

function quickProductCardHtml(payload) {
  const product = payload.product;
  const summary = payload.summary || {};
  const status = getStockStatus(product);
  const lastPurchase = payload.lastPurchase;
  const lastExit = payload.lastExit;
  const movements = payload.recentMovements || [];

  return `
    <div class="quick-stat-grid">
      <article class="quick-stat">
        <span>Stock actual</span>
        <strong>${product.stock}</strong>
        <small>Minimo ${product.minStock} · <span class="badge ${status.key}">${status.label}</span></small>
      </article>
      <article class="quick-stat">
        <span>Precio</span>
        <strong>${formatter.format(product.price)}</strong>
        <small>Costo ${formatter.format(product.cost || 0)}</small>
      </article>
      <article class="quick-stat">
        <span>Utilidad unidad</span>
        <strong>${formatter.format(summary.unitMargin || 0)}</strong>
        <small>Margen ${percentFormatter.format(summary.marginPercent || 0)}%</small>
      </article>
      <article class="quick-stat">
        <span>Valor inventario</span>
        <strong>${formatter.format(summary.stockValue || 0)}</strong>
        <small>Costo estimado ${formatter.format(summary.costValue || 0)}</small>
      </article>
    </div>

    <div class="quick-meta-grid">
      ${quickMetaItem("Proveedor", product.supplier || "Sin proveedor")}
      ${quickMetaItem("Ubicacion", product.location || "Sin ubicacion")}
      ${quickMetaItem("Descripcion", product.description || "Sin descripcion")}
      ${quickMetaItem("Actualizado", product.updatedAt ? formatDate(product.updatedAt) : "Sin fecha")}
    </div>

    <div class="quick-activity-grid">
      ${quickActivityCard("Ultima compra", lastPurchase ? [
        `${formatUnits(lastPurchase.quantity)} · ${formatter.format(lastPurchase.totalCost)}`,
        `${lastPurchase.supplier} · ${formatDate(lastPurchase.createdAt)}`
      ] : ["Sin compras registradas"])}
      ${quickActivityCard("Ultimo uso", lastExit ? [
        `${formatUnits(Math.abs(lastExit.quantity))} · ${lastExit.movementTypeLabel}`,
        `${lastExit.note || "Uso en cocina"} · ${formatDate(lastExit.createdAt)}`
      ] : ["Sin usos registrados"])}
    </div>

    <section class="quick-history">
      <h3>Ultimos movimientos</h3>
      ${movements.length ? movements.map(quickMovementHtml).join("") : `<div class="empty-state">Sin movimientos registrados.</div>`}
    </section>
  `;
}

function quickMetaItem(label, value) {
  return `
    <article class="quick-meta-item">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </article>
  `;
}

function quickActivityCard(title, lines) {
  return `
    <article class="quick-activity-card">
      <span>${escapeHtml(title)}</span>
      ${lines.map((line, index) => index === 0 ? `<strong>${escapeHtml(line)}</strong>` : `<small>${escapeHtml(line)}</small>`).join("")}
    </article>
  `;
}

function quickMovementHtml(movement) {
  const sign = movement.quantity > 0 ? "+" : "";
  const badge = movement.quantity > 0 ? "ok" : "low";
  return `
    <article class="quick-history-item">
      <div>
        <strong>${escapeHtml(movement.movementTypeLabel || "Movimiento")}</strong>
        <small>${escapeHtml(movement.note || "Sin nota")} · ${formatDate(movement.createdAt)}</small>
      </div>
      <span class="badge ${badge}">${sign}${movement.quantity}</span>
    </article>
  `;
}

function openExitModal(product) {
  if (!requireStockAccess()) return;
  els.exitForm.reset();
  els.exitProductId.value = product.id;
  els.exitProductName.textContent = `${product.name} · Stock actual: ${product.stock} · Costo: ${formatter.format(product.cost || 0)} · Precio: ${formatter.format(product.price || 0)}`;
  els.exitQuantity.max = product.stock;
  els.exitQuantity.value = product.stock > 0 ? 1 : "";
  els.exitMovementType.value = "venta";
  updateExitModalMeasureOptions(product);
  els.exitNote.value = exitTypeNotes.venta;
  els.exitModal.classList.add("active");
  els.exitModal.setAttribute("aria-hidden", "false");
  els.exitQuantity.focus();
}

function closeExitModal() {
  els.exitModal.classList.remove("active");
  els.exitModal.setAttribute("aria-hidden", "true");
}

async function saveProductFromForm(event) {
  event.preventDefault();
  if (!requireAdmin()) return;

  const formData = new FormData(els.form);
  const id = document.querySelector("#productId").value;
  const existing = state.products.find((product) => product.id === id);

  const product = {
    id,
    name: formData.get("name").trim(),
    sku: formData.get("sku").trim().toUpperCase(),
    description: formData.get("description").trim(),
    category: formData.get("category").trim(),
    subcategory: formData.get("subcategory").trim(),
    supplier: existing?.supplier || "",
    stock: Number(formData.get("stock")),
    minStock: Number(formData.get("minStock")),
    cost: Number(existing?.cost || 0),
    price: Number(formData.get("price")),
    location: existing?.location || "",
    updatedAt: new Date().toISOString()
  };

  if (!product.sku) {
    product.sku = createSku(product.name, product.category);
  }

  if (!product.name || !product.category) {
    showToast("Completa nombre y categoria.");
    return;
  }

  try {
    const response = await window.Auth.apiFetch(existing ? `/api/products/${id}` : "/api/products", {
      method: existing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(product)
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "No se pudo guardar el producto.");

    await loadRemoteData();
    closeModal();
    render();
    showToast(existing ? "Producto actualizado." : "Producto creado.");
  } catch (error) {
    showToast(error.message || "No se pudo guardar el producto.");
  }
}

async function handleRowAction(event) {
  const { action, id, amount } = event.currentTarget.dataset;
  const product = state.products.find((item) => item.id === id);
  if (!product) return;

  if (action === "quick-view") {
    await openQuickProductModal(product);
    return;
  }

  if (action === "report-empty") {
    await reportEmptyProduct(product);
    return;
  }

  if (action === "edit") {
    if (!requireAdmin()) return;
    openModal(product);
    return;
  }

  if (action === "detailed-exit") {
    if (!requireStockAccess()) return;
    openExitModal(product);
    return;
  }

  if (action === "delete") {
    if (!requireAdmin()) return;
    if (!confirm(`Eliminar ${product.name} del inventario?`)) return;
    const response = await window.Auth.apiFetch(`/api/products/${id}`, { method: "DELETE" });
    const payload = await response.json();
    if (!response.ok) {
      showToast(payload.error || "No se pudo eliminar el producto.");
      return;
    }
    await loadRemoteData();
    render();
    showToast("Producto eliminado del inventario.");
    return;
  }

  if (action === "adjust") {
    if (!requireStockAccess()) return;
    adjustStock(product.id, Number(amount));
  }
}

async function reportEmptyProduct(product) {
  const message = prompt(`Mensaje para admin sobre ${product.name}:`, "Producto agotado o sin existencia en inventario.");
  if (message === null) return;

  const response = await window.Auth.apiFetch(`/api/products/${product.id}/stock-alert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message })
  });
  const payload = await response.json();
  if (!response.ok) {
    showToast(payload.error || "No se pudo enviar el aviso.");
    return;
  }
  const notificationMessage = stockAlertNotificationMessage(payload.notifications);
  showToast(notificationMessage.message, notificationMessage.duration);
}

async function saveDetailedExit(event) {
  event.preventDefault();
  if (!requireStockAccess()) return;

  const productId = els.exitProductId.value;
  const product = state.products.find((item) => item.id === productId);
  const quantity = Number(els.exitQuantity.value);
  const movementType = els.exitMovementType.value;
  const measureUnit = selectedMeasureUnitValue(els.exitModalMeasureUnit);
  const note = els.exitNote.value.trim() || exitTypeNotes[movementType] || "Uso en cocina";

  if (!product) {
    showToast("Producto no encontrado.");
    return;
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    showToast("Captura una cantidad valida.");
    return;
  }
  if (!measureUnit) {
    showToast("Captura la unidad de medida.");
    return;
  }
  if (hasInvalidCustomMeatMeasure(els.exitModalMeasureUnit)) {
    showToast("Escribe la otra cantidad en gramos o kilos, por ejemplo 750 g.");
    return;
  }

  if (quantity > product.stock) {
    showToast("No hay suficiente stock para registrar ese uso.");
    return;
  }

  const response = await window.Auth.apiFetch(`/api/products/${productId}/exit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quantity, measureUnit, movementType, note })
  });
  const payload = await response.json();
  if (!response.ok) {
    showToast(payload.error || "No se pudo registrar el uso de insumo.");
    return;
  }

  closeExitModal();
  await loadRemoteData();
  state.exitReport = null;
  state.incomeReport = null;
  state.profitReport = null;
  state.comparisonReport = null;
  render();
  showToast("Uso de insumo registrado.");
}

async function adjustStock(id, amount) {
  if (!requireStockAccess()) return;
  const product = state.products.find((item) => item.id === id);
  if (!product) return;

  const response = await window.Auth.apiFetch(`/api/products/${id}/adjust`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount })
  });
  const payload = await response.json();
  if (!response.ok) {
    showToast(payload.error || "No se pudo ajustar el stock.");
    return;
  }

  await loadRemoteData();
  state.exitReport = null;
  state.incomeReport = null;
  state.profitReport = null;
  state.comparisonReport = null;
  render();
  showToast(`${product.name}: stock ${amount > 0 ? "aumentado" : "reducido"}.`);
}

async function clearMovements() {
  if (!requireAdmin()) return;
  if (!confirm("Limpiar todo el historial de movimientos?")) return;
  const response = await window.Auth.apiFetch("/api/movements", { method: "DELETE" });
  const payload = await response.json();
  if (!response.ok) {
    showToast(payload.error || "No se pudo limpiar el historial.");
    return;
  }
  await loadRemoteData();
  render();
  showToast("Historial de movimientos limpiado.");
}

async function resetDemo() {
  if (!requireAdmin()) return;
  if (!confirm("Restaurar los datos demo? Esto reemplaza el inventario actual.")) return;
  const response = await window.Auth.apiFetch("/api/reset-demo", { method: "POST" });
  const payload = await response.json();
  if (!response.ok) {
    showToast(payload.error || "No se pudieron restaurar los datos demo.");
    return;
  }
  await loadRemoteData();
  render();
  showToast("Datos demo restaurados.");
}

function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";
  localStorage.setItem(THEME_KEY, state.theme);
  document.body.classList.toggle("dark", state.theme === "dark");
  showToast(state.theme === "dark" ? "Tema oscuro activado." : "Tema claro activado.");
  render();
}

async function downloadBackup() {
  if (!requireAdmin()) return;
  const response = await window.Auth.apiFetch("/api/export");
  const payload = await response.json();
  if (!response.ok) {
    showToast(payload.error || "No se pudo exportar el respaldo.");
    return;
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `inventario_querendona-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  showToast("Respaldo descargado.");
}

function importBackup(event) {
  if (!requireAdmin()) {
    event.target.value = "";
    return;
  }
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!Array.isArray(parsed.products)) throw new Error("Formato invalido");
      const response = await window.Auth.apiFetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed)
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudo importar el archivo.");
      await loadRemoteData();
      render();
      showToast("Respaldo importado.");
    } catch (error) {
      showToast(error.message || "No se pudo importar el archivo.");
    } finally {
      event.target.value = "";
    }
  };
  reader.readAsText(file);
}

function getStockStatus(product) {
  if (product.stock === 0) return { key: "out", label: "Agotado" };
  if (product.stock <= product.minStock) return { key: "low", label: "Bajo" };
  return { key: "ok", label: "Saludable" };
}

function smartAlertBadge(severity) {
  if (severity === "critical") return "out";
  if (severity === "high" || severity === "medium") return "low";
  return "ok";
}

function formatCategoryPath(item) {
  return item.subcategory ? `${item.category} / ${item.subcategory}` : item.category || "Sin categoria";
}

function normalizeSearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function createSku(name, category) {
  const prefix = `${category} ${name}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 16)
    .toUpperCase();
  return `${prefix || "PROD"}-${Date.now().toString().slice(-6)}`;
}

function initials(name) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function formatDate(value) {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatDateInput(value) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatUnits(value) {
  const units = Number(value);
  return `${units} ${units === 1 ? "unidad" : "unidades"}`;
}

function formatMeasureQuantity(value, measureUnit) {
  const unit = measureUnit || "Pieza";
  return `${Number(value)} ${unit}`;
}

function signedNumber(value) {
  const number = Number(value || 0);
  return number > 0 ? `+${number}` : String(number);
}

function showToast(message, duration = 2400) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => els.toast.classList.remove("show"), duration);
}

function stockAlertNotificationMessage(notifications = []) {
  const whatsapp = notifications.find((item) => item.channel === "whatsapp" || item.channel === "sendStockAlertWhatsapp");

  if (whatsapp?.status === "sent") {
    return { message: "Aviso guardado y WhatsApp enviado.", duration: 3000 };
  }

  if (whatsapp?.status === "failed") {
    return { message: `Aviso guardado, pero WhatsApp fallo: ${whatsapp.error}`, duration: 7000 };
  }

  if (whatsapp?.status === "skipped") {
    return { message: "Aviso guardado, pero WhatsApp no esta configurado.", duration: 5000 };
  }

  return { message: "Aviso enviado al admin.", duration: 3000 };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

init();
