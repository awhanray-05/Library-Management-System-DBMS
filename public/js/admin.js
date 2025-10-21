// Admin Dashboard JavaScript

let currentSection = 'dashboard';
let booksData = [];
let membersData = [];
let transactionsData = [];
let finesData = [];

// Initialize admin dashboard
document.addEventListener('DOMContentLoaded', function() {
    // Check authentication
    if (!authToken() || !currentUser()) {
        window.location.href = 'index.html';
        return;
    }
    
    if (currentUser().role !== 'ADMIN' && currentUser().role !== 'LIBRARIAN') {
        window.location.href = 'index.html';
        return;
    }
    
    // Set user info
    document.getElementById('userName').textContent = currentUser().name;
    
    // Load initial data
    loadDashboardData();
    loadBooks();
    loadMembers();
    loadTransactions();
    loadFines();
    
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
        currentSection = sectionName;
        
        // Update page title
        document.getElementById('pageTitle').textContent = 
            sectionName.charAt(0).toUpperCase() + sectionName.slice(1);
        
        // Load section-specific data
        switch(sectionName) {
            case 'dashboard':
                loadDashboardData();
                break;
            case 'books':
                loadBooks();
                break;
            case 'members':
                loadMembers();
                break;
            case 'transactions':
                loadTransactions();
                break;
            case 'fines':
                loadFines();
                break;
        }
    }
}

// Load dashboard data
async function loadDashboardData() {
    try {
        showLoading();
        const response = await apiRequest('/admin/dashboard');
        const data = response.data;
        
        // Update stats
        document.getElementById('totalMembers').textContent = data.totalMembers;
        document.getElementById('totalBooks').textContent = data.totalBooks;
        document.getElementById('availableBooks').textContent = data.availableBooks;
        document.getElementById('borrowedBooks').textContent = data.borrowedBooks;
        document.getElementById('overdueBooks').textContent = data.overdueBooks;
        document.getElementById('totalFines').textContent = `$${data.totalFines}`;
        
        // Update recent transactions
        displayRecentTransactions(data.recentTransactions);
        
        // Update top books
        displayTopBooks(data.topBooks);
        
    } catch (error) {
        showToast('Failed to load dashboard data: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// Display recent transactions
function displayRecentTransactions(transactions) {
    const container = document.getElementById('recentTransactions');
    
    if (transactions.length === 0) {
        container.innerHTML = '<p>No recent transactions</p>';
        return;
    }
    
    container.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Member</th>
                    <th>Book</th>
                    <th>Date</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
                ${transactions.map(t => `
                    <tr>
                        <td>${t.MEMBER_NAME}</td>
                        <td>${t.TITLE}</td>
                        <td>${new Date(t.ISSUE_DATE).toLocaleDateString()}</td>
                        <td><span class="status-badge status-${t.STATUS.toLowerCase()}">${t.STATUS}</span></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

// Display top books
function displayTopBooks(books) {
    const container = document.getElementById('topBooks');
    
    if (books.length === 0) {
        container.innerHTML = '<p>No data available</p>';
        return;
    }
    
    container.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Title</th>
                    <th>Author</th>
                    <th>Borrow Count</th>
                </tr>
            </thead>
            <tbody>
                ${books.map(b => `
                    <tr>
                        <td>${b.TITLE}</td>
                        <td>${b.AUTHOR}</td>
                        <td>${b.BORROW_COUNT}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

// Load books
async function loadBooks() {
    try {
        showLoading();
        const response = await apiRequest('/books?limit=50');
        booksData = response.data;
        displayBooks(booksData);
        
        // Load categories for filter
        loadBookCategories();
        
    } catch (error) {
        showToast('Failed to load books: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// Display books
function displayBooks(books) {
    const tbody = document.getElementById('booksTableBody');
    
    if (books.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7">No books found</td></tr>';
        return;
    }
    
    tbody.innerHTML = books.map(book => `
        <tr>
            <td>${book.TITLE}</td>
            <td>${book.AUTHOR}</td>
            <td>${book.ISBN || 'N/A'}</td>
            <td>${book.CATEGORY || 'N/A'}</td>
            <td>${book.AVAILABLE_COPIES}/${book.TOTAL_COPIES}</td>
            <td><span class="status-badge status-${book.STATUS.toLowerCase()}">${book.STATUS}</span></td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-sm btn-primary" onclick="editBook(${book.BOOK_ID})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteBook(${book.BOOK_ID})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

// Load book categories
async function loadBookCategories() {
    try {
        const response = await apiRequest('/books/categories/list');
        const categoryFilter = document.getElementById('bookCategoryFilter');
        
        categoryFilter.innerHTML = '<option value="">All Categories</option>';
        response.data.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            categoryFilter.appendChild(option);
        });
        
    } catch (error) {
        console.error('Failed to load categories:', error);
    }
}

// Filter books
function filterBooks() {
    const searchTerm = document.getElementById('bookSearch').value.toLowerCase();
    const category = document.getElementById('bookCategoryFilter').value;
    const status = document.getElementById('bookStatusFilter').value;
    
    const filteredBooks = booksData.filter(book => {
        const matchesSearch = !searchTerm || 
            book.TITLE.toLowerCase().includes(searchTerm) ||
            book.AUTHOR.toLowerCase().includes(searchTerm) ||
            (book.ISBN && book.ISBN.toLowerCase().includes(searchTerm));
        
        const matchesCategory = !category || book.CATEGORY === category;
        const matchesStatus = !status || book.STATUS === status;
        
        return matchesSearch && matchesCategory && matchesStatus;
    });
    
    displayBooks(filteredBooks);
}

// Load members
async function loadMembers() {
    try {
        showLoading();
        const response = await apiRequest('/members?limit=50');
        membersData = response.data;
        displayMembers(membersData);
        
    } catch (error) {
        showToast('Failed to load members: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// Display members
function displayMembers(members) {
    const tbody = document.getElementById('membersTableBody');
    
    if (members.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7">No members found</td></tr>';
        return;
    }
    
    tbody.innerHTML = members.map(member => `
        <tr>
            <td>${member.FIRST_NAME} ${member.LAST_NAME}</td>
            <td>${member.EMAIL}</td>
            <td>${member.PHONE || 'N/A'}</td>
            <td>${member.MEMBERSHIP_TYPE}</td>
            <td>${member.BORROWED_BOOKS || 0}</td>
            <td><span class="status-badge status-${member.STATUS.toLowerCase()}">${member.STATUS}</span></td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-sm btn-primary" onclick="editMember(${member.MEMBER_ID})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteMember(${member.MEMBER_ID})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

// Filter members
function filterMembers() {
    const searchTerm = document.getElementById('memberSearch').value.toLowerCase();
    const status = document.getElementById('memberStatusFilter').value;
    
    const filteredMembers = membersData.filter(member => {
        const matchesSearch = !searchTerm || 
            member.FIRST_NAME.toLowerCase().includes(searchTerm) ||
            member.LAST_NAME.toLowerCase().includes(searchTerm) ||
            member.EMAIL.toLowerCase().includes(searchTerm);
        
        const matchesStatus = !status || member.STATUS === status;
        
        return matchesSearch && matchesStatus;
    });
    
    displayMembers(filteredMembers);
}

// Load transactions
async function loadTransactions() {
    try {
        showLoading();
        const response = await apiRequest('/transactions?limit=50');
        transactionsData = response.data;
        displayTransactions(transactionsData);
        
    } catch (error) {
        showToast('Failed to load transactions: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// Display transactions
function displayTransactions(transactions) {
    const tbody = document.getElementById('transactionsTableBody');
    
    if (transactions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9">No transactions found</td></tr>';
        return;
    }
    
    tbody.innerHTML = transactions.map(transaction => `
        <tr>
            <td>${transaction.TRANSACTION_ID}</td>
            <td>${transaction.MEMBER_NAME}</td>
            <td>${transaction.TITLE}</td>
            <td>${new Date(transaction.ISSUE_DATE).toLocaleDateString()}</td>
            <td>${new Date(transaction.DUE_DATE).toLocaleDateString()}</td>
            <td>${transaction.RETURN_DATE ? new Date(transaction.RETURN_DATE).toLocaleDateString() : 'N/A'}</td>
            <td><span class="status-badge status-${transaction.CURRENT_STATUS.toLowerCase()}">${transaction.CURRENT_STATUS}</span></td>
            <td>$${transaction.FINE_AMOUNT || 0}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-sm btn-warning" onclick="returnBook(${transaction.TRANSACTION_ID})" 
                            ${transaction.STATUS !== 'BORROWED' ? 'disabled' : ''}>
                        <i class="fas fa-undo"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

// Filter transactions
function filterTransactions() {
    const searchTerm = document.getElementById('transactionSearch').value.toLowerCase();
    const status = document.getElementById('transactionStatusFilter').value;
    const fromDate = document.getElementById('transactionDateFrom').value;
    const toDate = document.getElementById('transactionDateTo').value;
    
    const filteredTransactions = transactionsData.filter(transaction => {
        const matchesSearch = !searchTerm || 
            transaction.MEMBER_NAME.toLowerCase().includes(searchTerm) ||
            transaction.TITLE.toLowerCase().includes(searchTerm);
        
        const matchesStatus = !status || transaction.CURRENT_STATUS === status;
        
        const matchesDate = (!fromDate || new Date(transaction.ISSUE_DATE) >= new Date(fromDate)) &&
                           (!toDate || new Date(transaction.ISSUE_DATE) <= new Date(toDate));
        
        return matchesSearch && matchesStatus && matchesDate;
    });
    
    displayTransactions(filteredTransactions);
}

// Load fines
async function loadFines() {
    try {
        showLoading();
        const response = await apiRequest('/admin/fines?limit=50');
        finesData = response.data;
        displayFines(finesData);
        
    } catch (error) {
        showToast('Failed to load fines: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// Display fines
function displayFines(fines) {
    const tbody = document.getElementById('finesTableBody');
    
    if (fines.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7">No fines found</td></tr>';
        return;
    }
    
    tbody.innerHTML = fines.map(fine => `
        <tr>
            <td>${fine.FINE_ID}</td>
            <td>${fine.MEMBER_NAME}</td>
            <td>${fine.TITLE}</td>
            <td>$${fine.FINE_AMOUNT}</td>
            <td>${new Date(fine.FINE_DATE).toLocaleDateString()}</td>
            <td><span class="status-badge status-${fine.STATUS.toLowerCase()}">${fine.STATUS}</span></td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-sm btn-success" onclick="markFinePaid(${fine.FINE_ID})" 
                            ${fine.STATUS === 'PAID' ? 'disabled' : ''}>
                        <i class="fas fa-check"></i>
                    </button>
                    <button class="btn btn-sm btn-warning" onclick="waiveFine(${fine.FINE_ID})" 
                            ${fine.STATUS === 'PAID' ? 'disabled' : ''}>
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

// Filter fines
function filterFines() {
    const searchTerm = document.getElementById('fineSearch').value.toLowerCase();
    const status = document.getElementById('fineStatusFilter').value;
    
    const filteredFines = finesData.filter(fine => {
        const matchesSearch = !searchTerm || 
            fine.MEMBER_NAME.toLowerCase().includes(searchTerm) ||
            fine.TITLE.toLowerCase().includes(searchTerm);
        
        const matchesStatus = !status || fine.STATUS === status;
        
        return matchesSearch && matchesStatus;
    });
    
    displayFines(filteredFines);
}

// Setup event listeners
function setupEventListeners() {
    // Search inputs
    document.getElementById('bookSearch').addEventListener('input', filterBooks);
    document.getElementById('memberSearch').addEventListener('input', filterMembers);
    document.getElementById('transactionSearch').addEventListener('input', filterTransactions);
    document.getElementById('fineSearch').addEventListener('input', filterFines);
    
    // Filter selects
    document.getElementById('bookCategoryFilter').addEventListener('change', filterBooks);
    document.getElementById('bookStatusFilter').addEventListener('change', filterBooks);
    document.getElementById('memberStatusFilter').addEventListener('change', filterMembers);
    document.getElementById('transactionStatusFilter').addEventListener('change', filterTransactions);
    document.getElementById('fineStatusFilter').addEventListener('change', filterFines);
}

// Toggle sidebar on mobile
function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    sidebar.classList.toggle('open');
}

// Modal functions (to be implemented)
function showAddBookModal() {
    showToast('Add Book modal - To be implemented', 'info');
}

function showAddMemberModal() {
    showToast('Add Member modal - To be implemented', 'info');
}

function showIssueBookModal() {
    showToast('Issue Book modal - To be implemented', 'info');
}

function showReturnBookModal() {
    showToast('Return Book modal - To be implemented', 'info');
}

// Action functions (to be implemented)
function editBook(bookId) {
    showToast(`Edit book ${bookId} - To be implemented`, 'info');
}

function deleteBook(bookId) {
    if (confirm('Are you sure you want to delete this book?')) {
        showToast(`Delete book ${bookId} - To be implemented`, 'info');
    }
}

function editMember(memberId) {
    showToast(`Edit member ${memberId} - To be implemented`, 'info');
}

function deleteMember(memberId) {
    if (confirm('Are you sure you want to delete this member?')) {
        showToast(`Delete member ${memberId} - To be implemented`, 'info');
    }
}

function returnBook(transactionId) {
    if (confirm('Are you sure you want to return this book?')) {
        showToast(`Return book for transaction ${transactionId} - To be implemented`, 'info');
    }
}

function markFinePaid(fineId) {
    if (confirm('Mark this fine as paid?')) {
        showToast(`Mark fine ${fineId} as paid - To be implemented`, 'info');
    }
}

function waiveFine(fineId) {
    if (confirm('Waive this fine?')) {
        showToast(`Waive fine ${fineId} - To be implemented`, 'info');
    }
}

// Report functions (to be implemented)
function generateOverdueReport() {
    showToast('Generate overdue report - To be implemented', 'info');
}

function generateMemberReport() {
    showToast('Generate member report - To be implemented', 'info');
}

function generateBookReport() {
    showToast('Generate book report - To be implemented', 'info');
}
