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
        console.log('✅ Using API key from window.HARDCOVER_API_KEY');
        return window.HARDCOVER_API_KEY;
    }
    
    // Try localStorage (for local development, can be set manually)
    const storedKey = localStorage.getItem('HARDCOVER_API_KEY');
    if (storedKey) {
        console.log('✅ Using API key from localStorage');
        return storedKey;
    }
    
    // Try to load from config.json
    try {
        const response = await fetch('data/config.json');
        const config = await response.json();
        if (config.hardcoverApiKey) {
            console.log('✅ Using API key from config.json');
            return config.hardcoverApiKey;
        }
    } catch (error) {
        console.warn('Could not load config.json:', error);
    }
    
    console.warn('⚠️  No Hardcover API key found. Set it via localStorage.setItem("HARDCOVER_API_KEY", "your-key")');
    return null;
}

/**
 * Get Hardcover User ID from environment
 * Supports:
 * - window.HARDCOVER_USER_ID
 * - localStorage
 * - config.json (fallback)
 */
async function getHardcoverUserId() {
    // First, try window variable
    if (window.HARDCOVER_USER_ID) {
        console.log('✅ Using User ID from window.HARDCOVER_USER_ID');
        return window.HARDCOVER_USER_ID;
    }
    
    // Try localStorage
    const storedUserId = localStorage.getItem('HARDCOVER_USER_ID');
    if (storedUserId) {
        console.log('✅ Using User ID from localStorage');
        return storedUserId;
    }
    
    // Try to load from config.json
    try {
        const response = await fetch('data/config.json');
        const config = await response.json();
        if (config.hardcoverUserId) {
            console.log('✅ Using User ID from config.json');
            return config.hardcoverUserId;
        } else {
            console.warn('⚠️  hardcoverUserId not found in config.json');
        }
    } catch (error) {
        console.warn('Could not load config.json:', error);
    }
    
    console.warn('⚠️  No Hardcover User ID found. Set it via localStorage.setItem("HARDCOVER_USER_ID", "your-user-id") or add hardcoverUserId to config.json');
    return null;
}

/**
 * Get API base URL - use proxy in development, Cloudflare Worker in production
 * Hardcover API uses GraphQL endpoint
 */
function getApiBaseUrl() {
    // Check if we're running on localhost (development)
    const isLocalhost = window.location.hostname === 'localhost' || 
                       window.location.hostname === '127.0.0.1' ||
                       window.location.port === '8081';
    
    // Use local proxy if on localhost
    if (isLocalhost) {
        return '/api/proxy/v1/graphql';
    }
    
    // Use Cloudflare Worker CORS proxy for production (GitHub Pages)
    return 'https://hardcover-proxy.igor-butsky.workers.dev';
}

/**
 * Fetch books with reading status from Hardcover API using GraphQL
 * @param {string} apiKey - Hardcover API key
 * @param {string} userId - Hardcover User ID
 * @returns {Promise<Array>} Array of books with reading status
 */
async function fetchHardcoverBooks(apiKey, userId) {
    if (!apiKey) {
        throw new Error('Hardcover API key is not configured');
    }
    
    if (!userId) {
        throw new Error('Hardcover User ID is not configured. Please add hardcoverUserId to config.json or set HARDCOVER_USER_ID in localStorage.');
    }
    
    const apiBase = getApiBaseUrl();
    const isProxy = apiBase.startsWith('/api/proxy');
    
    console.log(`📡 Fetching books from GraphQL API: ${apiBase}${isProxy ? ' (via proxy)' : ' (direct)'}`);
    
    // GraphQL query to get books with "Currently Reading" status (status_id: 2)
    // See: https://docs.hardcover.app/api/guides/gettingbookswithstatus/
    const graphqlQuery = {
        query: `
            query GetReadingBooks($userId: Int!, $statusId: Int!) {
                user_books(
                    where: {user_id: {_eq: $userId}, status_id: {_eq: $statusId}}
                ) {
                    id
                    user_id
                    book_id
                    status_id
                    rating
                    book {
                        id
                        title
                        pages
                        image {
                            url
                        }
                        contributions {
                            author {
                                name
                            }
                        }
                    }
                    user_book_reads {
                        id
                        started_at
                        finished_at
                        progress_pages
                        edition {
                            pages
                        }
                    }
                }
            }
        `,
        variables: {
            userId: parseInt(userId, 10),  // Convert to integer
            statusId: 2  // 2 = "Currently Reading" status
        }
    };
    
    try {
        // Build headers
        const headers = {
            'Content-Type': 'application/json'
        };
        
        if (isProxy) {
            // For proxy, send API key in custom header
            headers['X-API-Key'] = apiKey;
            // Also include Authorization for compatibility
            headers['Authorization'] = `Bearer ${apiKey}`;
        } else {
            // For direct API, use Authorization header
            headers['Authorization'] = `Bearer ${apiKey}`;
        }
        
        console.log(`🔗 Sending GraphQL query to: ${apiBase}`);
        console.log(`📋 Query variables:`, { userId, statusId: 2 });
        
        const response = await fetch(apiBase, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(graphqlQuery)
        });
        
        console.log(`📊 Response status: ${response.status}`);
        
        if (!response.ok) {
            let errorMessage = `API request failed: ${response.status} ${response.statusText}`;
            
            // Try to get error details from response
            try {
                const errorData = await response.json();
                if (errorData.errors) {
                    errorMessage = errorData.errors.map(e => e.message).join('; ');
                } else if (errorData.error || errorData.message) {
                    errorMessage = errorData.error || errorData.message;
                }
                console.error('📄 Error response data:', errorData);
            } catch (e) {
                const errorText = await response.text();
                console.error('📄 Error response text:', errorText);
            }
            
            if (response.status === 401) {
                throw new Error('Invalid API key. Please check your API key in config.json or localStorage.');
            }
            if (response.status === 404) {
                throw new Error(`API endpoint not found. Please check the API documentation at https://docs.hardcover.app. Error: ${errorMessage}`);
            }
            throw new Error(errorMessage);
        }
        
        const data = await response.json();
        console.log(`📚 Received GraphQL response:`, data);
        
        // Handle GraphQL response format
        if (data.errors) {
            throw new Error(`GraphQL errors: ${data.errors.map(e => e.message).join('; ')}`);
        }
        
        if (data.data && data.data.user_books) {
            // Transform GraphQL response to our format
            return data.data.user_books.map(userBook => {
                // Get progress from user_book_reads (most recent read)
                const reads = userBook.user_book_reads || [];
                const currentRead = reads.find(r => !r.finished_at) || reads[0];
                const progressPages = currentRead?.progress_pages || 0;
                
                // Get total pages from edition or book
                const totalPages = currentRead?.edition?.pages || userBook.book.pages || 0;
                
                // Calculate percentage
                const percentage = totalPages > 0 ? Math.round((progressPages / totalPages) * 100) : 0;
                
                console.log(`📖 Book: ${userBook.book.title}, Progress: ${progressPages}/${totalPages} (${percentage}%)`);
                
                return {
                    id: userBook.book.id,
                    title: userBook.book.title,
                    coverUrl: userBook.book.image?.url || null,
                    author: userBook.book.contributions?.[0]?.author?.name || 'Unknown',
                    progress: percentage,
                    currentPage: progressPages,
                    totalPages: totalPages,
                    percentage: percentage
                };
            });
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
        const userId = await getHardcoverUserId();
        if (!userId) {
            console.warn('⚠️  Hardcover User ID not configured. Cannot fetch progress.');
            return null;
        }
        
        const books = await fetchHardcoverBooks(apiKey, userId);
        
        // Just return the first book with "Currently Reading" status
        // User is responsible for ensuring correct book is tracked on Hardcover
        if (books.length > 0) {
            const currentBook = books[0];
            console.log(`📖 Hardcover progress: "${currentBook.title}" - ${currentBook.currentPage}/${currentBook.totalPages} (${currentBook.percentage}%)`);
            
            return {
                progress: currentBook.percentage || 0,
                currentPage: currentBook.currentPage || 0,
                totalPages: currentBook.totalPages || 0,
                percentage: currentBook.percentage || 0,
                hardcoverTitle: currentBook.title,
                hardcoverAuthor: currentBook.author
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

