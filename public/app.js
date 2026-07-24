// App State
let state = {
  products: [],
  services: [],
  cart: [],
  transactions: [],
  activeView: 'home',
  activeDashboardTab: 'overview',
  isAdminAuthenticated: false
};

// SVG Sales Chart Generator
function renderSalesChart(transactions) {
  const container = document.getElementById('svg-sales-chart');
  if (!container) return;

  if (!transactions || transactions.length === 0) {
    container.innerHTML = `
      <div class="loading-state" style="padding: 2rem 0;">
        <i data-lucide="info" style="width: 24px; height: 24px;"></i>
        <p>No transaction data available yet to chart.</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  // Aggregate recent transactions by date (limit to last 7 days or points)
  // Sort transactions by date ascending
  const sortedTxns = [...transactions]
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .slice(-10); // Take last 10 points

  const width = container.clientWidth || 500;
  const height = 200;
  const padding = 30;

  const chartWidth = width - (padding * 2);
  const chartHeight = height - (padding * 2);

  // Find max and min values
  const totals = sortedTxns.map(t => t.total);
  const maxTotal = Math.max(...totals, 1000); // at least 1000 scale
  const minTotal = 0;

  // Calculate points
  const points = sortedTxns.map((txn, index) => {
    const x = padding + (index / (sortedTxns.length - 1 || 1)) * chartWidth;
    // Invert Y coordinate since SVG (0,0) is top-left
    const y = padding + chartHeight - ((txn.total - minTotal) / (maxTotal - minTotal)) * chartHeight;
    return { x, y, label: new Date(txn.timestamp).toLocaleDateString(undefined, {month: 'short', day: 'numeric'}), total: txn.total };
  });

  // Generate SVG code
  let svgContent = `<svg width="100%" height="100%" viewBox="0 0 ${width} ${height}">`;
  
  // Gradients for area under curve
  svgContent += `
    <defs>
      <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--color-primary)" stop-opacity="0.3"/>
        <stop offset="100%" stop-color="var(--color-primary)" stop-opacity="0.0"/>
      </linearGradient>
    </defs>
  `;

  // Draw Grid lines
  for (let i = 0; i <= 4; i++) {
    const yVal = padding + (i / 4) * chartHeight;
    const gridLabel = Math.round(maxTotal - (i / 4) * (maxTotal - minTotal));
    svgContent += `
      <line x1="${padding}" y1="${yVal}" x2="${width - padding}" y2="${yVal}" stroke="var(--border-color)" stroke-width="1" stroke-dasharray="4"/>
      <text x="${padding - 5}" y="${yVal + 4}" fill="var(--text-secondary)" font-size="8" text-anchor="end">${gridLabel}</text>
    `;
  }

  // Draw Area
  if (points.length > 1) {
    let areaPath = `M ${points[0].x} ${padding + chartHeight}`;
    points.forEach(p => {
      areaPath += ` L ${p.x} ${p.y}`;
    });
    areaPath += ` L ${points[points.length - 1].x} ${padding + chartHeight} Z`;
    svgContent += `<path d="${areaPath}" fill="url(#chartGradient)"/>`;
  }

  // Draw Line path
  if (points.length > 1) {
    let linePath = `M ${points[0].x} ${points[0].y}`;
    points.forEach(p => {
      linePath += ` L ${p.x} ${p.y}`;
    });
    svgContent += `<path d="${linePath}" fill="none" stroke="var(--color-primary)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
  }

  // Draw points & tooltips
  points.forEach(p => {
    svgContent += `
      <circle cx="${p.x}" cy="${p.y}" r="4" fill="var(--bg-secondary)" stroke="var(--color-primary)" stroke-width="2"/>
      <text x="${p.x}" y="${padding + chartHeight + 16}" fill="var(--text-secondary)" font-size="9" text-anchor="middle">${p.label}</text>
    `;
  });

  svgContent += `</svg>`;
  container.innerHTML = svgContent;
}

// Initial Loading
document.addEventListener('DOMContentLoaded', () => {
  // Check if session contains admin authentication credentials
  const savedPassword = sessionStorage.getItem('adminPassword');
  if (savedPassword) {
    state.isAdminAuthenticated = true;
  }
  
  // Set current date
  const dateEl = document.getElementById('db-current-time');
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }

  // Load products and services
  fetchProducts();
  fetchServices();
  
  // Set default theme from localStorage
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  
  // Initialize Lucide icons
  lucide.createIcons();

  // Start flyer slider auto-play
  initSlider();

  // Image preview listeners
  const stockImgInput = document.getElementById('stock-image');
  if (stockImgInput) {
    stockImgInput.addEventListener('change', () => previewImage('stock-image', 'stock-img-preview', 'stock-img-preview-src'));
  }
  const serviceImgInput = document.getElementById('service-image');
  if (serviceImgInput) {
    serviceImgInput.addEventListener('change', () => previewImage('service-image', 'service-img-preview', 'service-img-preview-src'));
  }
});

// Toast notification helper
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let iconName = 'check-circle';
  if (type === 'error') iconName = 'alert-circle';
  if (type === 'warning') iconName = 'alert-triangle';
  
  toast.innerHTML = `
    <i data-lucide="${iconName}"></i>
    <span>${message}</span>
  `;
  container.appendChild(toast);
  lucide.createIcons();
  
  // Auto remove
  setTimeout(() => {
    toast.style.animation = 'slideInToast 0.3s reverse forwards';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ============================================================
// FLYER SLIDER
// ============================================================
const FLYER_IMAGES = [
  '/images/flyer1.jpg',
  '/images/flyer2.jpg',
  '/images/flyer3.jpg',
  '/images/flyer4.jpg',
  '/images/flyer5.jpg'
];
let sliderIndex = 0;
let sliderTimer = null;

function initSlider() {
  goToSlide(0);
  sliderTimer = setInterval(() => {
    sliderNext();
  }, 5000);
}

function goToSlide(index) {
  sliderIndex = index;
  const track = document.getElementById('flyer-track');
  if (!track) return;
  track.style.transform = `translateX(-${sliderIndex * 100}%)`;
  
  // Update dots
  document.querySelectorAll('.slider-dot').forEach((dot, i) => {
    dot.classList.toggle('active', i === sliderIndex);
  });
}

function sliderNext() {
  goToSlide((sliderIndex + 1) % FLYER_IMAGES.length);
}

function sliderPrev() {
  goToSlide((sliderIndex - 1 + FLYER_IMAGES.length) % FLYER_IMAGES.length);
}

// ============================================================
// LIGHTBOX
// ============================================================
let lightboxIndex = 0;

function openLightbox(index) {
  lightboxIndex = index;
  const modal = document.getElementById('lightbox-modal');
  if (!modal) return;
  updateLightboxImage();
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
  // Pause slider while lightbox is open
  clearInterval(sliderTimer);
}

function closeLightbox() {
  const modal = document.getElementById('lightbox-modal');
  if (modal) modal.classList.remove('active');
  document.body.style.overflow = '';
  // Resume slider
  sliderTimer = setInterval(sliderNext, 5000);
}

function lightboxNext() {
  lightboxIndex = (lightboxIndex + 1) % FLYER_IMAGES.length;
  updateLightboxImage();
}

function lightboxPrev() {
  lightboxIndex = (lightboxIndex - 1 + FLYER_IMAGES.length) % FLYER_IMAGES.length;
  updateLightboxImage();
}

function updateLightboxImage() {
  const img = document.getElementById('lightbox-img');
  const counter = document.getElementById('lightbox-counter');
  const dl = document.getElementById('lightbox-download');
  const src = FLYER_IMAGES[lightboxIndex];
  if (img) img.src = src;
  if (counter) counter.textContent = `${lightboxIndex + 1} / ${FLYER_IMAGES.length}`;
  if (dl) { dl.href = src; dl.download = src.split('/').pop(); }
  lucide.createIcons();
}

// Close lightbox on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowRight') { const m = document.getElementById('lightbox-modal'); if (m && m.classList.contains('active')) lightboxNext(); }
  if (e.key === 'ArrowLeft')  { const m = document.getElementById('lightbox-modal'); if (m && m.classList.contains('active')) lightboxPrev(); }
});

// ============================================================
// IMAGE PREVIEW HELPER
// ============================================================
function previewImage(inputId, wrapId, imgId) {
  const input = document.getElementById(inputId);
  const wrap  = document.getElementById(wrapId);
  const img   = document.getElementById(imgId);
  if (!input || !input.files || !input.files[0]) { if (wrap) wrap.style.display = 'none'; return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    if (img) img.src = e.target.result;
    if (wrap) wrap.style.display = 'block';
  };
  reader.readAsDataURL(input.files[0]);
}

// Helper: read file input as Base64 data URL
function readFileAsBase64(inputId) {
  return new Promise((resolve) => {
    const input = document.getElementById(inputId);
    if (!input || !input.files || !input.files[0]) { resolve(null); return; }
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(input.files[0]);
  });
}

// View Controller (SPA Routing)
function navigateTo(viewId) {
  state.activeView = viewId;
  
  // Clean active navigation classes
  document.querySelectorAll('.main-nav a').forEach(a => a.classList.remove('active'));
  
  let targetViewId = `section-${viewId}`;
  
  // Special redirect for manager dashboard
  if (viewId === 'admin') {
    if (state.isAdminAuthenticated) {
      targetViewId = 'section-admin-dashboard';
      document.getElementById('nav-admin').classList.add('active');
      // Fetch fresh admin details
      fetchTransactions();
      fetchAdminStockList();
      fetchAdminServicesList();
    } else {
      targetViewId = 'section-admin-login';
      document.getElementById('nav-admin').classList.add('active');
    }
  } else {
    const navLink = document.getElementById(`nav-${viewId}`);
    if (navLink) navLink.classList.add('active');
  }

  // Hide all sections and show active
  document.querySelectorAll('.view-section').forEach(section => {
    section.classList.remove('active');
  });
  
  const targetSection = document.getElementById(targetViewId);
  if (targetSection) {
    targetSection.classList.add('active');
  }
  
  // Re-render components if transitioning to views
  if (viewId === 'shop') {
    fetchProducts();
  } else if (viewId === 'services') {
    fetchServices();
  }
}

// Theme Switcher
function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
}

// Password show/hide toggle
function togglePasswordVisibility(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  
  if (input.type === 'password') {
    input.type = 'text';
  } else {
    input.type = 'password';
  }
}

// --- PRODUCT CATALOG LOGIC ---

async function fetchProducts() {
  try {
    const response = await fetch('/api/stock');
    if (!response.ok) throw new Error("Failed to load inventory.");
    state.products = await response.json();
    renderProducts(state.products);
  } catch (err) {
    console.error(err);
    showToast("Error retrieving stock details.", "error");
  }
}

function renderProducts(items) {
  const container = document.getElementById('products-container');
  if (!container) return;
  
  if (items.length === 0) {
    container.innerHTML = `
      <div class="loading-state" style="grid-column: 1 / -1;">
        <i data-lucide="package-x" style="width: 48px; height: 48px;"></i>
        <p>No products available in stock at the moment.</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }
  
  container.innerHTML = items.map(item => {
    const isOutOfStock = item.quantity === 0;
    const isLowStock = item.quantity > 0 && item.quantity < 5;
    
    let badgeHtml = `<span class="prod-badge badge-stock">In Stock (${item.quantity} available)</span>`;
    if (isOutOfStock) {
      badgeHtml = `<span class="prod-badge badge-out-of-stock">Out of Stock</span>`;
    } else if (isLowStock) {
      badgeHtml = `<span class="prod-badge badge-low-stock">Low Stock (Only ${item.quantity} left)</span>`;
    }
    
    // Generate quantity options
    let qtySelectorHtml = '';
    if (!isOutOfStock) {
      qtySelectorHtml = `
        <div class="prod-qty-selector">
          <label for="qty-${item.id}">Quantity:</label>
          <select id="qty-${item.id}">
            ${Array.from({length: item.quantity}, (_, i) => `<option value="${i+1}">${i+1}</option>`).join('')}
          </select>
        </div>
      `;
    }

    const imageHtml = item.image
      ? `<div class="prod-image-wrap"><img src="${item.image}" alt="${item.name}" class="prod-image" loading="lazy"></div>`
      : `<div class="prod-image-wrap prod-image-placeholder"><i data-lucide="package" style="width:40px;height:40px;"></i></div>`;
    
    return `
      <div class="product-card">
        ${imageHtml}
        <div class="prod-details">
          ${badgeHtml}
          <h3 class="prod-title">${item.name}</h3>
          <div class="prod-price-label">Price</div>
          <div class="prod-price">KES ${item.price.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
        </div>
        <div>
          ${qtySelectorHtml}
          <button class="btn btn-primary w-full" ${isOutOfStock ? 'disabled' : ''} onclick="addToCart('${item.id}')">
            <i data-lucide="shopping-cart"></i> ${isOutOfStock ? 'Sold Out' : 'Add to Cart'}
          </button>
        </div>
      </div>
    `;
  }).join('');
  
  lucide.createIcons();
}

function filterProducts() {
  const query = document.getElementById('product-search').value.toLowerCase();
  const filtered = state.products.filter(p => p.name.toLowerCase().includes(query));
  renderProducts(filtered);
}

// --- CART & CHECKOUT LOGIC ---

function toggleCart() {
  const panel = document.getElementById('cart-side-panel');
  if (!panel) return;
  
  if (panel.classList.contains('active')) {
    panel.classList.remove('active');
  } else {
    panel.classList.add('active');
    renderCart();
  }
}

function addToCart(productId) {
  const item = state.products.find(p => p.id === productId);
  if (!item) return;
  
  const selectQty = parseInt(document.getElementById(`qty-${productId}`).value);
  if (isNaN(selectQty) || selectQty <= 0) return;
  
  // Check if item already in cart
  const existingCartIndex = state.cart.findIndex(c => c.id === productId);
  
  if (existingCartIndex > -1) {
    const totalRequested = state.cart[existingCartIndex].quantity + selectQty;
    if (totalRequested > item.quantity) {
      showToast(`Cannot add items. Only ${item.quantity} available in stock.`, "warning");
      return;
    }
    state.cart[existingCartIndex].quantity = totalRequested;
  } else {
    state.cart.push({
      id: item.id,
      name: item.name,
      price: item.price,
      quantity: selectQty
    });
  }
  
  updateCartBadge();
  showToast(`Added ${selectQty} x '${item.name}' to cart.`);
}

function removeFromCart(productId) {
  state.cart = state.cart.filter(c => c.id !== productId);
  updateCartBadge();
  renderCart();
}

function updateCartBadge() {
  const count = state.cart.reduce((sum, c) => sum + c.quantity, 0);
  const badge = document.getElementById('cart-badge-count');
  if (badge) {
    badge.textContent = count;
  }
}

function renderCart() {
  const container = document.getElementById('cart-items-list');
  const footerArea = document.getElementById('cart-footer-area');
  const subtotalEl = document.getElementById('cart-summary-subtotal');
  const totalEl = document.getElementById('cart-summary-total');
  const checkoutBtn = document.getElementById('btn-submit-order');
  
  if (!container) return;
  
  if (state.cart.length === 0) {
    container.innerHTML = `
      <div class="cart-empty-message">
        <i data-lucide="shopping-cart"></i>
        <p>Your cart is empty.</p>
        <button class="btn btn-primary btn-sm" onclick="toggleCart()">Browse Inventory</button>
      </div>
    `;
    footerArea.style.display = 'none';
    lucide.createIcons();
    return;
  }
  
  footerArea.style.display = 'flex';
  
  let subtotal = 0;
  
  container.innerHTML = state.cart.map(c => {
    const rowTotal = c.price * c.quantity;
    subtotal += rowTotal;
    
    return `
      <div class="cart-item-row">
        <div class="cart-item-details">
          <h4>${c.name}</h4>
          <span class="cart-item-price">KES ${c.price.toLocaleString()}</span>
        </div>
        <div class="cart-item-actions">
          <span class="cart-item-qty">${c.quantity} x</span>
          <button class="btn-icon btn-sm" style="width: 28px; height: 28px; border-color: var(--color-danger); color: var(--color-danger);" onclick="removeFromCart('${c.id}')">
            <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
  
  subtotalEl.textContent = `KES ${subtotal.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
  totalEl.textContent = `KES ${subtotal.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
  checkoutBtn.textContent = `Place Order (KES ${subtotal.toLocaleString()})`;
  
  lucide.createIcons();
}

async function handleCheckout(event) {
  event.preventDefault();
  
  const firstName = document.getElementById('cust-firstname').value.trim();
  const lastName = document.getElementById('cust-lastname').value.trim();
  const phone = document.getElementById('cust-phone').value.trim();
  const location = document.getElementById('cust-location').value.trim();
  
  if (!firstName || !lastName || !phone || !location) {
    showToast("Please fill in all customer details.", "warning");
    return;
  }
  
  const checkoutPayload = {
    customer: { firstName, lastName, phone, location },
    items: state.cart
  };
  
  try {
    const response = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(checkoutPayload)
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.message || "Checkout failed.");
    }
    
    showToast(`Order placed successfully! Transaction ID: ${result.transactionId}`);
    
    // Clear cart and close drawer
    state.cart = [];
    updateCartBadge();
    toggleCart();
    
    // Reset form
    document.getElementById('checkout-form').reset();
    
    // Refresh stock list
    fetchProducts();
  } catch (err) {
    console.error(err);
    showToast(err.message, "error");
  }
}

// --- SERVICES BOOKING LOGIC ---

async function fetchServices() {
  try {
    const response = await fetch('/api/services');
    if (!response.ok) throw new Error("Failed to fetch services list.");
    state.services = await response.json();
    renderServices(state.services);
  } catch (err) {
    console.error(err);
    showToast("Error retrieving technical services.", "error");
  }
}

function renderServices(services) {
  const container = document.getElementById('services-container');
  if (!container) return;
  
  if (services.length === 0) {
    container.innerHTML = `
      <div class="loading-state" style="grid-column: 1 / -1;">
        <i data-lucide="wrench" style="width: 48px; height: 48px;"></i>
        <p>No services listed by the administrator at this time.</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }
  
  container.innerHTML = services.map(s => {
    const imageHtml = s.image
      ? `<div class="service-image-wrap"><img src="${s.image}" alt="${s.name}" class="service-image" loading="lazy"></div>`
      : `<div class="service-image-wrap service-image-placeholder"><i data-lucide="wrench" style="width:36px;height:36px;"></i></div>`;
    return `
      <div class="service-card">
        ${imageHtml}
        <div class="service-header-part">
          <h3>${s.name}</h3>
          <div class="service-price-tag">KES ${s.price.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
          <p class="service-desc">${s.description || 'Professional technology support customized to your specific business requirements.'}</p>
        </div>
        <button class="btn btn-outline w-full" onclick="openServiceBookingModal('${s.id}')">
          Book Service <i data-lucide="calendar"></i>
        </button>
      </div>
    `;
  }).join('');
  
  lucide.createIcons();
}

function openServiceBookingModal(serviceId) {
  const service = state.services.find(s => s.id === serviceId);
  if (!service) return;
  
  document.getElementById('booking-service-id').value = serviceId;
  document.getElementById('modal-service-title').textContent = `Book: ${service.name}`;
  document.getElementById('modal-service-price').textContent = `Cost Estimate: KES ${service.price.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
  document.getElementById('modal-service-desc').textContent = service.description || '';
  
  const modal = document.getElementById('service-booking-modal');
  if (modal) {
    modal.classList.add('active');
  }
}

function closeServiceBookingModal() {
  const modal = document.getElementById('service-booking-modal');
  if (modal) {
    modal.classList.remove('active');
    document.getElementById('service-booking-form').reset();
  }
}

async function handleServiceBooking(event) {
  event.preventDefault();
  
  const serviceId = document.getElementById('booking-service-id').value;
  const firstName = document.getElementById('book-firstname').value.trim();
  const lastName = document.getElementById('book-lastname').value.trim();
  const phone = document.getElementById('book-phone').value.trim();
  const location = document.getElementById('book-location').value.trim();
  const notes = document.getElementById('book-notes').value.trim();
  
  if (!firstName || !lastName || !phone || !location) {
    showToast("Please fill in contact and location details.", "warning");
    return;
  }
  
  const bookingPayload = {
    serviceId,
    customer: { firstName, lastName, phone, location },
    notes
  };
  
  try {
    const response = await fetch('/api/book-service', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bookingPayload)
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.message || "Booking request failed.");
    }
    
    showToast(`Booking submitted successfully! ID: ${result.transactionId}`);
    closeServiceBookingModal();
  } catch (err) {
    console.error(err);
    showToast(err.message, "error");
  }
}

// --- ADMIN / MANAGER PORTAL LOGIC ---

async function handleAdminLogin(event) {
  event.preventDefault();
  
  const password = document.getElementById('admin-password-input').value;
  if (!password) return;
  
  try {
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.message || "Authentication failed.");
    }
    
    state.isAdminAuthenticated = true;
    sessionStorage.setItem('adminPassword', password);
    showToast("Access Granted. Welcome back, Manager!");
    
    document.getElementById('admin-login-form').reset();
    navigateTo('admin');
  } catch (err) {
    console.error(err);
    showToast(err.message, "error");
  }
}

function handleAdminLogout() {
  state.isAdminAuthenticated = false;
  sessionStorage.removeItem('adminPassword');
  showToast("Logged out successfully.");
  navigateTo('home');
}

// Sidebar Tab switching in Admin panel
function switchDashboardTab(tabId) {
  state.activeDashboardTab = tabId;
  
  // Clean active menu styles
  document.querySelectorAll('.sidebar-menu a').forEach(a => a.classList.remove('active'));
  
  const menuBtn = document.getElementById(`db-tab-${tabId}`);
  if (menuBtn) menuBtn.classList.add('active');
  
  // Hide all panels and show current
  document.querySelectorAll('.db-panel').forEach(panel => {
    panel.classList.remove('active');
  });
  
  const activePanel = document.getElementById(`db-panel-${tabId}`);
  if (activePanel) {
    activePanel.classList.add('active');
  }
  
  // Pull fresh data based on tab selected
  if (tabId === 'overview') {
    fetchTransactions();
    fetchAdminStockList();
  } else if (tabId === 'inventory') {
    fetchAdminStockList();
  } else if (tabId === 'services') {
    fetchAdminServicesList();
  } else if (tabId === 'transactions') {
    fetchTransactions();
  }
}

// API fetches with Admin credentials in headers
function getAdminHeaders() {
  const password = sessionStorage.getItem('adminPassword');
  return {
    'Content-Type': 'application/json',
    'x-admin-password': password || ''
  };
}

async function fetchTransactions() {
  if (!state.isAdminAuthenticated) return;
  
  try {
    const response = await fetch('/api/admin/transactions', {
      headers: getAdminHeaders()
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        handleAdminLogout();
        showToast("Session expired or unauthorized password.", "error");
        return;
      }
      throw new Error("Failed to load transactions.");
    }
    
    state.transactions = await response.json();
    updateOverviewStats();
    renderTransactionsTable(state.transactions);
    renderSalesChart(state.transactions);
  } catch (err) {
    console.error(err);
    showToast("Error retrieving sales logs.", "error");
  }
}

function updateOverviewStats() {
  // Aggregate sales revenue
  const revenue = state.transactions.reduce((sum, t) => sum + t.total, 0);
  document.getElementById('stat-revenue').textContent = `KES ${revenue.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
  
  // Aggregate orders counts
  document.getElementById('stat-orders-count').textContent = state.transactions.length;
  
  // Distinct stock item types
  document.getElementById('stat-items-count').textContent = state.products.length;
  
  // Calculate low stock items count
  const lowStockCount = state.products.filter(p => p.quantity < 5).length;
  document.getElementById('stat-low-stock-count').textContent = lowStockCount;
  
  // Render Low Stock Warnings widget
  const lowStockContainer = document.getElementById('dashboard-low-stock-list');
  if (lowStockContainer) {
    const lowStockItems = state.products.filter(p => p.quantity < 5);
    if (lowStockItems.length === 0) {
      lowStockContainer.innerHTML = `
        <div style="text-align: center; color: var(--text-secondary); padding: 2rem 0; font-size: 0.9rem;">
          <i data-lucide="check-circle" style="width: 24px; height: 24px; color: var(--color-success); margin-bottom: 0.5rem; display: block; margin-left: auto; margin-right: auto;"></i>
          All stock levels are optimal.
        </div>
      `;
    } else {
      lowStockContainer.innerHTML = lowStockItems.map(item => {
        return `
          <div class="low-stock-item">
            <div class="low-stock-info">
              <h4>${item.name}</h4>
              <span>Price: KES ${item.price.toLocaleString()}</span>
            </div>
            <div class="low-stock-qty">
              ${item.quantity} Left
            </div>
          </div>
        `;
      }).join('');
    }
    lucide.createIcons();
  }
}

function renderTransactionsTable(transactionsList) {
  const container = document.getElementById('admin-transactions-table-body');
  if (!container) return;
  
  if (transactionsList.length === 0) {
    container.innerHTML = `
      <tr>
        <td colspan="6" class="text-center" style="color: var(--text-secondary); padding: 3rem 0;">
          No transactions registered in ledger yet.
        </td>
      </tr>
    `;
    return;
  }
  
  container.innerHTML = transactionsList.map(txn => {
    const dateStr = new Date(txn.timestamp).toLocaleString();
    const isService = txn.type === 'service';
    
    // Setup purchased details cell content
    let purchaseDetails = '';
    if (isService) {
      purchaseDetails = `
        <div class="items-list-block">
          <div class="item-list-row"><strong>Service:</strong> ${txn.service.name}</div>
          ${txn.service.notes ? `<div class="item-list-row" style="font-size: 0.8rem; color: var(--text-secondary);">Notes: "${txn.service.notes}"</div>` : ''}
        </div>
      `;
    } else {
      purchaseDetails = `
        <div class="items-list-block">
          ${txn.items.map(i => `<div class="item-list-row">${i.name} <span>x${i.quantity} (KES ${i.price.toLocaleString()})</span></div>`).join('')}
        </div>
      `;
    }
    
    return `
      <tr>
        <td>
          <div style="font-weight: 700;">${txn.id}</div>
          <div style="font-size: 0.75rem; color: var(--text-secondary);">${dateStr}</div>
        </td>
        <td>
          <div class="cust-info-block">
            <span class="name">${txn.customer.firstName} ${txn.customer.lastName}</span>
            <span class="phone"><i data-lucide="phone" style="width: 10px; height: 10px; display: inline; vertical-align: middle;"></i> ${txn.customer.phone}</span>
          </div>
        </td>
        <td>
          <span class="badge ${isService ? 'badge-info' : 'badge-success'}">${txn.type}</span>
        </td>
        <td>${purchaseDetails}</td>
        <td style="font-size: 0.85rem; max-width: 180px;">${txn.customer.location}</td>
        <td class="text-right font-mono" style="font-weight: 700;">KES ${txn.total.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
      </tr>
    `;
  }).join('');
  
  lucide.createIcons();
}

function filterTransactions() {
  const filterType = document.getElementById('transaction-filter-type').value;
  if (filterType === 'all') {
    renderTransactionsTable(state.transactions);
  } else {
    const filtered = state.transactions.filter(t => t.type === filterType);
    renderTransactionsTable(filtered);
  }
}

// --- ADMIN STOCK / INVENTORY MANAGEMENT ---

async function fetchAdminStockList() {
  if (!state.isAdminAuthenticated) return;
  try {
    const response = await fetch('/api/stock');
    if (!response.ok) throw new Error("Failed to sync inventory.");
    state.products = await response.json();
    renderAdminStockTable(state.products);
    updateOverviewStats();
  } catch (err) {
    console.error(err);
    showToast("Error updating stock catalog.", "error");
  }
}

function renderAdminStockTable(items) {
  const container = document.getElementById('admin-stock-table-body');
  if (!container) return;
  
  if (items.length === 0) {
    container.innerHTML = `
      <tr>
        <td colspan="5" class="text-center" style="color: var(--text-secondary); padding: 2rem 0;">
          No stock items listed. Add items using the control form.
        </td>
      </tr>
    `;
    return;
  }
  
  container.innerHTML = items.map(item => {
    return `
      <tr>
        <td class="font-mono" style="font-size: 0.8rem; color: var(--text-secondary);">${item.id}</td>
        <td style="font-weight: 600;">${item.name}</td>
        <td class="text-right font-mono">KES ${item.price.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
        <td class="text-center font-bold ${item.quantity < 5 ? 'text-warning' : ''}">${item.quantity} units</td>
        <td class="text-center">
          <button class="btn btn-danger btn-sm" onclick="handleDeleteStockItem('${item.id}')">
            <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
  
  lucide.createIcons();
}

async function handleAddStockItem(event) {
  event.preventDefault();
  
  const name = document.getElementById('stock-name').value.trim();
  const price = parseFloat(document.getElementById('stock-price').value);
  const quantity = parseInt(document.getElementById('stock-qty').value);
  
  if (!name || isNaN(price) || isNaN(quantity)) {
    showToast("Invalid inputs.", "warning");
    return;
  }

  // Read image if selected
  const imageBase64 = await readFileAsBase64('stock-image');
  
  try {
    const response = await fetch('/api/admin/stock', {
      method: 'POST',
      headers: getAdminHeaders(),
      body: JSON.stringify({ name, price, quantity, image: imageBase64 })
    });
    
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Failed to add stock item.");
    
    showToast(`Stock item '${name}' registered successfully!`);
    document.getElementById('add-stock-form').reset();
    document.getElementById('stock-img-preview').style.display = 'none';
    fetchAdminStockList();
  } catch (err) {
    console.error(err);
    showToast(err.message, "error");
  }
}

async function handleDeleteStockItem(itemId) {
  if (!confirm("Are you sure you want to delete this item from stock?")) return;
  
  try {
    const response = await fetch(`/api/admin/stock/${itemId}`, {
      method: 'DELETE',
      headers: getAdminHeaders()
    });
    
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Failed to delete item.");
    
    showToast("Stock item deleted.");
    fetchAdminStockList();
  } catch (err) {
    console.error(err);
    showToast(err.message, "error");
  }
}

// --- ADMIN SERVICES MANAGEMENT ---

async function fetchAdminServicesList() {
  if (!state.isAdminAuthenticated) return;
  try {
    const response = await fetch('/api/services');
    if (!response.ok) throw new Error("Failed to sync service entries.");
    state.services = await response.json();
    renderAdminServicesTable(state.services);
  } catch (err) {
    console.error(err);
    showToast("Error updating services directory.", "error");
  }
}

function renderAdminServicesTable(services) {
  const container = document.getElementById('admin-services-table-body');
  if (!container) return;
  
  if (services.length === 0) {
    container.innerHTML = `
      <tr>
        <td colspan="4" class="text-center" style="color: var(--text-secondary); padding: 2rem 0;">
          No technical services configured.
        </td>
      </tr>
    `;
    return;
  }
  
  container.innerHTML = services.map(s => {
    return `
      <tr>
        <td style="font-weight: 600; min-width: 160px;">${s.name}</td>
        <td style="font-size: 0.85rem; color: var(--text-secondary); max-width: 250px;">${s.description || 'N/A'}</td>
        <td class="text-right font-mono" style="font-weight: 600;">KES ${s.price.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
        <td class="text-center">
          <button class="btn btn-danger btn-sm" onclick="handleDeleteService('${s.id}')">
            <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
  
  lucide.createIcons();
}

async function handleAddService(event) {
  event.preventDefault();
  
  const name = document.getElementById('service-name').value.trim();
  const price = parseFloat(document.getElementById('service-price').value);
  const description = document.getElementById('service-desc').value.trim();
  
  if (!name || isNaN(price)) {
    showToast("Invalid fields.", "warning");
    return;
  }

  // Read image if selected
  const imageBase64 = await readFileAsBase64('service-image');
  
  try {
    const response = await fetch('/api/admin/services', {
      method: 'POST',
      headers: getAdminHeaders(),
      body: JSON.stringify({ name, price, description, image: imageBase64 })
    });
    
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Failed to publish service.");
    
    showToast(`Service '${name}' published.`);
    document.getElementById('add-service-form').reset();
    document.getElementById('service-img-preview').style.display = 'none';
    fetchAdminServicesList();
  } catch (err) {
    console.error(err);
    showToast(err.message, "error");
  }
}

async function handleDeleteService(serviceId) {
  if (!confirm("Are you sure you want to remove this service from listing?")) return;
  
  try {
    const response = await fetch(`/api/admin/services/${serviceId}`, {
      method: 'DELETE',
      headers: getAdminHeaders()
    });
    
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Failed to delete service.");
    
    showToast("Service entry deleted.");
    fetchAdminServicesList();
  } catch (err) {
    console.error(err);
    showToast(err.message, "error");
  }
}

// --- PASSWORD CHANGE LOGIC ---

async function handleChangePassword(event) {
  event.preventDefault();
  
  const newPassword = document.getElementById('new-password-input').value;
  const confirmPassword = document.getElementById('confirm-password-input').value;
  
  if (!newPassword || newPassword.trim().length === 0) {
    showToast("Password cannot be empty.", "warning");
    return;
  }
  
  if (newPassword !== confirmPassword) {
    showToast("Confirm password does not match.", "warning");
    return;
  }
  
  try {
    const response = await fetch('/api/admin/change-password', {
      method: 'POST',
      headers: getAdminHeaders(),
      body: JSON.stringify({ newPassword })
    });
    
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Failed to update password.");
    
    showToast("Administrator password updated successfully!");
    
    // Update local session storage credentials
    sessionStorage.setItem('adminPassword', newPassword);
    
    // Reset form
    document.getElementById('change-password-form').reset();
  } catch (err) {
    console.error(err);
    showToast(err.message, "error");
  }
}
