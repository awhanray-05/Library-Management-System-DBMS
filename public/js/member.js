// Member Portal JavaScript

let memberData = null;
let borrowedBooks = [];
let fines = [];

// Initialize member portal
document.addEventListener('DOMContentLoaded', function() {
    // Check authentication
    if (!authToken() || !currentUser()) {
        window.location.href = 'index.html';
        return;
    }
    
    if (currentUser().role !== 'MEMBER') {
        window.location.href = 'index.html';
        return;
    }
    
    // Set user info
    document.getElementById('memberName').textContent = currentUser().name;
    document.getElementById('welcomeName').textContent = currentUser().name;
    
    // Load member data
    loadMemberData();
    loadBorrowedBooks();
    loadFines();
    loadBookFilters();
    
    // Setup navigation
    setupNavigation();
    
    // Setup event listeners
    setupEventListeners();
});

// Navigation setup
function setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Remove active class from all items
            document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
            
            // Add active class to clicked item
            this.classList.add('active');
            
            // Show corresponding section
            const section = this.getAttribute('data-section');
            showSection(section);
        });
    });
}

// Show section
function showSection(sectionName) {
    // Hide all sections
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });
    
    // Show target section
    const targetSection = document.getElementById(sectionName);
    if (targetSection) {
        targetSection.classList.add('active');
        
        // Load section-specific data
        switch(sectionName) {
            case 'dashboard':
                loadDashboardData();
                break;
            case 'search':
                loadBookFilters();
                break;
            case 'borrowed':
                loadBorrowedBooks();
                break;
            case 'fines':
                loadFines();
                break;
            case 'profile':
                loadProfile();
                break;
        }
    }
}

// Load member data
async function loadMemberData() {
    try {
        const response = await apiRequest('/auth/me');
        memberData = response.user;
        updateMemberStats();
        
    } catch (error) {
        showToast('Failed to load member data: ' + error.message, 'error');
    }
}

// Update member stats
function updateMemberStats() {
    if (!memberData) return;
    
    // These would be calculated from actual data
    document.getElementById('borrowedCount').textContent = borrowedBooks.filter(b => b.STATUS === 'BORROWED').length;
    document.getElementById('overdueCount').textContent = borrowedBooks.filter(b => b.CURRENT_STATUS === 'OVERDUE').length;
    
    const totalFines = fines.filter(f => f.STATUS === 'PENDING').reduce((sum, f) => sum + f.FINE_AMOUNT, 0);
    document.getElementById('totalFines').textContent = `$${totalFines}`;
}

// Load dashboard data
async function loadDashboardData() {
    try {
        showLoading();
        
        // Load current borrowed books
        const borrowedResponse = await apiRequest(`/members/${currentUser().id}/borrowed-books`);
        borrowedBooks = borrowedResponse.data;
        
        // Load fines
        const finesResponse = await apiRequest(`/members/${currentUser().id}/fines`);
        fines = finesResponse.data;
        
        // Update stats
        updateMemberStats();
        
        // Display current borrowed books
        displayCurrentBorrowedBooks(borrowedBooks.filter(b => b.STATUS === 'BORROWED'));
        
        // Display recent activity (simplified)
        displayRecentActivity(borrowedBooks.slice(0, 5));
        
    } catch (error) {
        showToast('Failed to load dashboard data: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// Display current borrowed books
function displayCurrentBorrowedBooks(books) {
    const container = document.getElementById('currentBorrowed');
    
    if (books.length === 0) {
        container.innerHTML = '<p>No books currently borrowed</p>';
        return;
    }
    
    container.innerHTML = books.map(book => `
        <div class="book-item">
            <div class="book-title">${book.TITLE}</div>
            <div class="book-author">by ${book.AUTHOR}</div>
            <div class="book-details">
                <span><strong>Due Date:</strong> ${new Date(book.DUE_DATE).toLocaleDateString()}</span>
                <span><strong>Status:</strong> ${book.CURRENT_STATUS}</span>
            </div>
            ${book.CURRENT_STATUS === 'OVERDUE' ? 
                `<div class="book-status status-overdue">Overdue - Fine: $${book.FINE_AMOUNT}</div>` : 
                `<div class="book-status status-${book.CURRENT_STATUS.toLowerCase()}">${book.CURRENT_STATUS}</div>`
            }
        </div>
    `).join('');
}

// Display recent activity
function displayRecentActivity(activities) {
    const container = document.getElementById('recentActivity');
    
    if (activities.length === 0) {
        container.innerHTML = '<p>No recent activity</p>';
        return;
    }
    
    container.innerHTML = activities.map(activity => `
        <div class="activity-item">
            <div>${activity.TITLE} by ${activity.AUTHOR}</div>
            <div class="activity-date">
                ${activity.STATUS === 'BORROWED' ? 'Borrowed' : 'Returned'} on ${new Date(activity.ISSUE_DATE).toLocaleDateString()}
            </div>
        </div>
    `).join('');
}

// Load borrowed books
async function loadBorrowedBooks() {
    try {
        showLoading();
        const response = await apiRequest(`/members/${currentUser().id}/borrowed-books`);
        borrowedBooks = response.data;
        displayBorrowedBooks(borrowedBooks);
        
    } catch (error) {
        showToast('Failed to load borrowed books: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// Display borrowed books
function displayBorrowedBooks(books) {
    const currentBooksList = document.getElementById('currentBooksList');
    const historyBooksList = document.getElementById('historyBooksList');
    
    const currentBooks = books.filter(b => b.STATUS === 'BORROWED');
    const historyBooks = books.filter(b => b.STATUS === 'RETURNED');
    
    // Display current books
    if (currentBooks.length === 0) {
        currentBooksList.innerHTML = '<p>No books currently borrowed</p>';
    } else {
        currentBooksList.innerHTML = currentBooks.map(book => `
            <div class="book-item">
                <div class="book-title">${book.TITLE}</div>
                <div class="book-author">by ${book.AUTHOR}</div>
                <div class="book-details">
                    <span><strong>Borrowed:</strong> ${new Date(book.ISSUE_DATE).toLocaleDateString()}</span>
                    <span><strong>Due:</strong> ${new Date(book.DUE_DATE).toLocaleDateString()}</span>
                </div>
                <div class="book-status status-${book.CURRENT_STATUS.toLowerCase()}">${book.CURRENT_STATUS}</div>
                ${book.CURRENT_STATUS === 'OVERDUE' ? 
                    `<div style="color: #dc3545; font-weight: bold;">Fine: $${book.FINE_AMOUNT}</div>` : ''
                }
            </div>
        `).join('');
    }
    
    // Display history
    if (historyBooks.length === 0) {
        historyBooksList.innerHTML = '<p>No borrowing history</p>';
    } else {
        historyBooksList.innerHTML = historyBooks.map(book => `
            <div class="book-item">
                <div class="book-title">${book.TITLE}</div>
                <div class="book-author">by ${book.AUTHOR}</div>
                <div class="book-details">
                    <span><strong>Borrowed:</strong> ${new Date(book.ISSUE_DATE).toLocaleDateString()}</span>
                    <span><strong>Returned:</strong> ${book.RETURN_DATE ? new Date(book.RETURN_DATE).toLocaleDateString() : 'N/A'}</span>
                </div>
                <div class="book-status status-${book.STATUS.toLowerCase()}">${book.STATUS}</div>
            </div>
        `).join('');
    }
}

// Filter borrowed books
function filterBorrowedBooks(filter) {
    const currentBooksList = document.getElementById('currentBooksList');
    const historyBooksList = document.getElementById('historyBooksList');
    
    // Update tab styles
    document.querySelectorAll('.filter-tab').forEach(tab => tab.classList.remove('active'));
    event.target.classList.add('active');
    
    switch(filter) {
        case 'all':
            currentBooksList.style.display = 'block';
            historyBooksList.style.display = 'block';
            break;
        case 'current':
            currentBooksList.style.display = 'block';
            historyBooksList.style.display = 'none';
            break;
        case 'overdue':
            currentBooksList.style.display = 'block';
            historyBooksList.style.display = 'none';
            // Filter to show only overdue books
            const overdueBooks = borrowedBooks.filter(b => b.CURRENT_STATUS === 'OVERDUE');
            displayBorrowedBooks(overdueBooks);
            break;
        case 'history':
            currentBooksList.style.display = 'none';
            historyBooksList.style.display = 'block';
            break;
    }
}

// Load fines
async function loadFines() {
    try {
        showLoading();
        const response = await apiRequest(`/members/${currentUser().id}/fines`);
        fines = response.data;
        displayFines(fines);
        updateFinesSummary();
        
    } catch (error) {
        showToast('Failed to load fines: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// Display fines
function displayFines(finesList) {
    const container = document.getElementById('finesList');
    
    if (finesList.length === 0) {
        container.innerHTML = '<p>No fines found</p>';
        return;
    }
    
    container.innerHTML = finesList.map(fine => `
        <div class="fine-item ${fine.STATUS.toLowerCase()}">
            <div class="fine-header">
                <div class="fine-amount">$${fine.FINE_AMOUNT}</div>
                <div class="book-title">${fine.TITLE}</div>
            </div>
            <div class="fine-details">
                <span><strong>Date:</strong> ${new Date(fine.FINE_DATE).toLocaleDateString()}</span>
                <span><strong>Status:</strong> ${fine.STATUS}</span>
                <span><strong>Reason:</strong> ${fine.REASON}</span>
            </div>
        </div>
    `).join('');
}

// Update fines summary
function updateFinesSummary() {
    const pendingFines = fines.filter(f => f.STATUS === 'PENDING').reduce((sum, f) => sum + f.FINE_AMOUNT, 0);
    const paidFines = fines.filter(f => f.STATUS === 'PAID').reduce((sum, f) => sum + f.FINE_AMOUNT, 0);
    
    document.getElementById('pendingFines').textContent = `$${pendingFines}`;
    document.getElementById('paidFines').textContent = `$${paidFines}`;
}

// Filter fines
function filterFines() {
    const status = document.getElementById('fineStatusFilter').value;
    
    const filteredFines = status ? fines.filter(f => f.STATUS === status) : fines;
    displayFines(filteredFines);
}

// Load profile
function loadProfile() {
    if (!memberData) return;
    
    document.getElementById('profileName').textContent = `${memberData.name}`;
    document.getElementById('profileEmail').textContent = memberData.email;
    document.getElementById('profileMembership').textContent = `${memberData.membershipType} Member`;
    document.getElementById('profileJoinDate').textContent = `Joined: ${new Date(memberData.joinDate).toLocaleDateString()}`;
}

// Edit profile
function editProfile() {
    document.getElementById('profileForm').style.display = 'block';
    
    // Populate form with current data
    document.getElementById('profileFirstName').value = memberData.name.split(' ')[0];
    document.getElementById('profileLastName').value = memberData.name.split(' ').slice(1).join(' ');
    document.getElementById('profileEmailInput').value = memberData.email;
    document.getElementById('profilePhone').value = memberData.phone || '';
    document.getElementById('profileAddress').value = memberData.address || '';
}

// Cancel edit profile
function cancelEditProfile() {
    document.getElementById('profileForm').style.display = 'none';
}

// Update profile
async function updateProfile() {
    try {
        showLoading();
        
        const updateData = {
            firstName: document.getElementById('profileFirstName').value,
            lastName: document.getElementById('profileLastName').value,
            email: document.getElementById('profileEmailInput').value,
            phone: document.getElementById('profilePhone').value,
            address: document.getElementById('profileAddress').value
        };
        
        await apiRequest(`/members/${currentUser().id}`, {
            method: 'PUT',
            body: JSON.stringify(updateData)
        });
        
        showToast('Profile updated successfully');
        cancelEditProfile();
        loadMemberData();
        
    } catch (error) {
        showToast('Failed to update profile: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// Load book filters
async function loadBookFilters() {
    try {
        const [categoriesResponse, authorsResponse] = await Promise.all([
            apiRequest('/books/categories/list'),
            apiRequest('/books/authors/list')
        ]);
        
        const categoryFilter = document.getElementById('bookCategoryFilter');
        const authorFilter = document.getElementById('bookAuthorFilter');
        
        // Clear existing options
        categoryFilter.innerHTML = '<option value="">All Categories</option>';
        authorFilter.innerHTML = '<option value="">All Authors</option>';
        
        // Add categories
        categoriesResponse.data.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            categoryFilter.appendChild(option);
        });
        
        // Add authors
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

// Search books
async function searchBooks() {
    const searchInput = document.getElementById('bookSearchInput');
    const categoryFilter = document.getElementById('bookCategoryFilter');
    const authorFilter = document.getElementById('bookAuthorFilter');
    const availabilityFilter = document.getElementById('bookAvailabilityFilter');
    
    const searchTerm = searchInput.value;
    const category = categoryFilter.value;
    const author = authorFilter.value;
    const availableOnly = availabilityFilter.value === 'available';
    
    try {
        showLoading();
        
        let queryParams = new URLSearchParams();
        if (searchTerm) queryParams.append('search', searchTerm);
        if (category) queryParams.append('category', category);
        if (author) queryParams.append('author', author);
        if (availableOnly) queryParams.append('available', 'true');
        
        const response = await apiRequest(`/books?${queryParams.toString()}`);
        displaySearchResults(response.data);
        
    } catch (error) {
        showToast('Search failed: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// Display search results
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

// Setup event listeners
function setupEventListeners() {
    // Profile form
    document.getElementById('updateProfileForm').addEventListener('submit', function(e) {
        e.preventDefault();
        updateProfile();
    });
    
    // Search functionality
    document.getElementById('bookSearchInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            searchBooks();
        }
    });
}
