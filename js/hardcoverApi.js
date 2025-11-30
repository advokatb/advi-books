// Hardcover API Integration
// Module for fetching reading progress from Hardcover.app API

/**
 * Get Hardcover API key from environment
 * Supports:
 * - window.HARDCOVER_API_KEY (for GitHub Pages deployment via GitHub Actions)
 * - localStorage (for local development)
 * - config.json (fallback)
 */
async function getHardcoverApiKey() {
    // First, try window variable (set by GitHub Actions during deployment)
    if (window.HARDCOVER_API_KEY) {
        return window.HARDCOVER_API_KEY;
    }
    
    // Try localStorage (for local development, can be set manually)
    const storedKey = localStorage.getItem('HARDCOVER_API_KEY');
    if (storedKey) {
        return storedKey;
    }
    
    // Try to load from config.json
    try {
        const response = await fetch('data/config.json');
        const config = await response.json();
        if (config.hardcoverApiKey) {
            return config.hardcoverApiKey;
        }
    } catch (error) {
        console.warn('Could not load config.json:', error);
    }
    
    return null;
}

/**
 * Fetch books with reading status from Hardcover API
 * @param {string} apiKey - Hardcover API key
 * @returns {Promise<Array>} Array of books with reading status
 */
async function fetchHardcoverBooks(apiKey) {
    if (!apiKey) {
        throw new Error('Hardcover API key is not configured');
    }
    
    try {
        // Try the documented endpoint first
        let response = await fetch('https://api.hardcover.app/v1/books?status=reading', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });
        
        // If that fails, try alternative endpoint
        if (!response.ok && response.status === 404) {
            response = await fetch('https://api.hardcover.app/v1/books', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            });
        }
        
        if (!response.ok) {
            if (response.status === 401) {
                throw new Error('Invalid API key');
            }
            if (response.status === 404) {
                throw new Error('API endpoint not found. Please check the API documentation.');
            }
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        // Handle different response formats
        if (Array.isArray(data)) {
            return data.filter(book => book.status === 'reading' || book.readingStatus === 'reading');
        }
        if (data.books) {
            return Array.isArray(data.books) ? data.books : [];
        }
        if (data.data && Array.isArray(data.data)) {
            return data.data.filter(book => book.status === 'reading' || book.readingStatus === 'reading');
        }
        return [];
    } catch (error) {
        console.error('Error fetching Hardcover books:', error);
        throw error;
    }
}

/**
 * Get reading progress for a book by matching title/author
 * @param {string} bookTitle - Book title to match
 * @param {string} bookAuthor - Book author to match
 * @param {string} apiKey - Hardcover API key
 * @returns {Promise<Object|null>} Progress data or null if not found
 */
async function getBookProgress(bookTitle, bookAuthor, apiKey) {
    try {
        const books = await fetchHardcoverBooks(apiKey);
        
        // Try to find matching book
        const normalizedTitle = bookTitle.toLowerCase().trim();
        const normalizedAuthor = bookAuthor ? bookAuthor.toLowerCase().trim() : '';
        
        const matchingBook = books.find(book => {
            const bookTitleNorm = (book.title || '').toLowerCase().trim();
            const bookAuthorNorm = (book.author || '').toLowerCase().trim();
            
            // Match by title (exact or partial)
            const titleMatch = bookTitleNorm === normalizedTitle || 
                             bookTitleNorm.includes(normalizedTitle) ||
                             normalizedTitle.includes(bookTitleNorm);
            
            // If author is provided, also match by author
            if (normalizedAuthor && bookAuthorNorm) {
                return titleMatch && (bookAuthorNorm === normalizedAuthor || 
                                     bookAuthorNorm.includes(normalizedAuthor) ||
                                     normalizedAuthor.includes(bookAuthorNorm));
            }
            
            return titleMatch;
        });
        
        if (matchingBook) {
            return {
                progress: matchingBook.progress || 0,
                currentPage: matchingBook.currentPage || 0,
                totalPages: matchingBook.totalPages || 0,
                percentage: matchingBook.progress || 0
            };
        }
        
        return null;
    } catch (error) {
        console.warn('Could not fetch book progress from Hardcover:', error);
        return null;
    }
}

// Export functions for ES6 modules
export {
    getHardcoverApiKey,
    fetchHardcoverBooks,
    getBookProgress
};

