// Global variables
let currentUser = null;
let authToken = null;

// API Base URL
const API_BASE = '/api';

// Utility functions
function showLoading() {
    document.getElementById('loadingSpinner').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loadingSpinner').style.display = 'none';
}

function showToast(message, type = 'success') {
    const toastContainer = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.5rem;">
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
            <span>${message}</span>
        </div>
    `;
    
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 5000);
}

// API Helper functions
async function apiRequest(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
        }
    };

    if (authToken) {
        defaultOptions.headers['Authorization'] = `Bearer ${authToken}`;
    }

    const finalOptions = { ...defaultOptions, ...options };
    
    try {
        const response = await fetch(url, finalOptions);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Request failed');
        }
        
        return data;
    } catch (error) {
        console.error('API Request failed:', error);
        throw error;
    }
}

// Authentication functions
async function loginMember(email, password) {
    try {
        showLoading();
        const response = await apiRequest('/auth/member-login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
        
        authToken = response.token;
        currentUser = response.user;
        localStorage.setItem('authToken', authToken);
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        
        showToast('Login successful!');
        setTimeout(() => {
            window.location.href = 'member.html';
        }, 1000);
        
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        hideLoading();
    }
}

async function loginAdmin(username, password) {
    try {
        showLoading();
        const response = await apiRequest('/auth/admin-login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        
        authToken = response.token;
        currentUser = response.user;
        localStorage.setItem('authToken', authToken);
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        
        showToast('Login successful!');
        setTimeout(() => {
            window.location.href = 'admin.html';
        }, 1000);
        
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        hideLoading();
    }
}

async function registerMember(userData) {
    try {
        showLoading();
        const response = await apiRequest('/auth/member-register', {
            method: 'POST',
            body: JSON.stringify(userData)
        });
        
        showToast('Registration successful! Please login.');
        closeModal('registerModal');
        
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        hideLoading();
    }
}

function logout() {
    authToken = null;
    currentUser = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    showToast('Logged out successfully');
    window.location.href = 'index.html';
}

// Modal functions
function showLoginModal() {
    document.getElementById('loginModal').style.display = 'block';
}

function showRegisterModal() {
    document.getElementById('registerModal').style.display = 'block';
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

function switchLoginTab(tab) {
    const memberForm = document.getElementById('memberLoginForm');
    const adminForm = document.getElementById('adminLoginForm');
    const tabs = document.querySelectorAll('.tab-btn');
    
    tabs.forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    
    if (tab === 'member') {
        memberForm.style.display = 'block';
        adminForm.style.display = 'none';
    } else {
        memberForm.style.display = 'none';
        adminForm.style.display = 'block';
    }
}

// Book search functions
async function searchBooks() {
    const searchInput = document.getElementById('searchInput');
    const categoryFilter = document.getElementById('categoryFilter');
    const authorFilter = document.getElementById('authorFilter');
    
    const searchTerm = searchInput.value;
    const category = categoryFilter.value;
    const author = authorFilter.value;
    
    try {
        showLoading();
        
        let queryParams = new URLSearchParams();
        if (searchTerm) queryParams.append('search', searchTerm);
        if (category) queryParams.append('category', category);
        if (author) queryParams.append('author', author);
        
        const response = await apiRequest(`/books?${queryParams.toString()}`);
        displaySearchResults(response.data);
        
    } catch (error) {
        showToast('Search failed: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

function displaySearchResults(books) {
    const resultsContainer = document.getElementById('searchResults');
    
    if (books.length === 0) {
        resultsContainer.innerHTML = '<p>No books found matching your criteria.</p>';
        return;
    }
    
    resultsContainer.innerHTML = books.map(book => `
        <div class="book-card">
            <div class="book-title">${book.TITLE}</div>
            <div class="book-author">by ${book.AUTHOR}</div>
            <div class="book-details">
                <span><strong>ISBN:</strong> ${book.ISBN || 'N/A'}</span>
                <span><strong>Category:</strong> ${book.CATEGORY || 'N/A'}</span>
                <span><strong>Publisher:</strong> ${book.PUBLISHER || 'N/A'}</span>
                <span><strong>Year:</strong> ${book.PUBLICATION_YEAR || 'N/A'}</span>
            </div>
            <div class="book-status ${book.AVAILABLE_COPIES > 0 ? 'status-available' : 'status-borrowed'}">
                ${book.AVAILABLE_COPIES > 0 ? 'Available' : 'Not Available'}
            </div>
        </div>
    `).join('');
}

// Load categories and authors for filters
async function loadBookFilters() {
    try {
        const [categoriesResponse, authorsResponse] = await Promise.all([
            apiRequest('/books/categories/list'),
            apiRequest('/books/authors/list')
        ]);
        
        const categoryFilter = document.getElementById('categoryFilter');
        const authorFilter = document.getElementById('authorFilter');
        
        categoriesResponse.data.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            categoryFilter.appendChild(option);
        });
        
        authorsResponse.data.forEach(author => {
            const option = document.createElement('option');
            option.value = author;
            option.textContent = author;
            authorFilter.appendChild(option);
        });
        
    } catch (error) {
        console.error('Failed to load filters:', error);
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
    // Check if user is already logged in
    const storedToken = localStorage.getItem('authToken');
    const storedUser = localStorage.getItem('currentUser');
    
    if (storedToken && storedUser) {
        authToken = storedToken;
        currentUser = JSON.parse(storedUser);
        
        // Redirect based on user role
        if (currentUser.role === 'ADMIN' || currentUser.role === 'LIBRARIAN') {
            window.location.href = 'admin.html';
        } else if (currentUser.role === 'MEMBER') {
            window.location.href = 'member.html';
        }
    }
    
    // Load book filters
    loadBookFilters();
    
    // Login form handlers
    document.getElementById('memberLoginForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const email = document.getElementById('memberEmail').value;
        const password = document.getElementById('memberPassword').value;
        await loginMember(email, password);
    });
    
    document.getElementById('adminLoginForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const username = document.getElementById('adminUsername').value;
        const password = document.getElementById('adminPassword').value;
        await loginAdmin(username, password);
    });
    
    // Register form handler
    document.getElementById('registerForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        
        if (password !== confirmPassword) {
            showToast('Passwords do not match', 'error');
            return;
        }
        
        const userData = {
            firstName: document.getElementById('firstName').value,
            lastName: document.getElementById('lastName').value,
            email: document.getElementById('email').value,
            phone: document.getElementById('phone').value,
            address: document.getElementById('address').value,
            membershipType: document.getElementById('membershipType').value,
            password: password
        };
        
        await registerMember(userData);
    });
    
    // Search functionality
    document.getElementById('searchInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            searchBooks();
        }
    });
    
    // Close modals when clicking outside
    window.addEventListener('click', function(e) {
        if (e.target.classList.contains('modal')) {
            e.target.style.display = 'none';
        }
    });
    
    // Navigation
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Remove active class from all links
            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            
            // Add active class to clicked link
            this.classList.add('active');
            
            // Show corresponding section
            const targetId = this.getAttribute('href').substring(1);
            const targetSection = document.getElementById(targetId);
            
            if (targetSection) {
                // Hide all sections
                document.querySelectorAll('section').forEach(section => {
                    section.style.display = 'none';
                });
                
                // Show target section
                targetSection.style.display = 'block';
            }
        });
    });
});

// Export functions for use in other files
window.apiRequest = apiRequest;
window.showToast = showToast;
window.showLoading = showLoading;
window.hideLoading = hideLoading;
window.authToken = () => authToken;
window.currentUser = () => currentUser;
window.logout = logout;
