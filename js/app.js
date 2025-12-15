// Modern Book Library App
// Main application file

import { fetchLiveLibData, loadStaticData } from './dataFetcher.js';
import { loadBooksFromStorage, saveBooksToStorage } from './storage.js';
import { getBookDeclension, setupTabSwitching } from './utils.js';
import { getHardcoverApiKey, getBookProgress } from './hardcoverApi.js';

// Book and BookCollection classes are loaded globally via script tags
// They should be available in global scope after scripts load
// We'll access them directly when needed

// ============================================
// Configuration
// ============================================

let config = {};
let username = '';
let readingChallengeGoal = 50;
let currentYear = new Date().getFullYear();

let allBooks = [];
let books = null;
let originalBooks = null; // Сохраняем оригинальную коллекцию без фильтров
let currentBooks = null;
let toReadBooks = null;
let lastUpdated = null;

// ============================================
// Data Loading
// ============================================

async function loadConfig() {
    const response = await fetch('data/config.json');
    config = await response.json();
    username = config.livelibUsername;
    readingChallengeGoal = config.readingChallengeGoal || 50;
    currentYear = new Date().getFullYear();
}

async function fetchAndCategorizeBooks(bookAnnotations, customPages, customDates) {
    let allBooksData, lastUpdatedTime;
    
    const stored = loadBooksFromStorage(username);
    if (stored && stored.allBooks.length > 0) {
        allBooksData = stored.allBooks;
        lastUpdatedTime = stored.lastUpdated;
        console.log(`Loaded ${allBooksData.length} books from localStorage`);
    } else {
        allBooksData = await fetchLiveLibData(username, bookAnnotations, customPages);
        lastUpdatedTime = new Date().toISOString();
        saveBooksToStorage(username, allBooksData, lastUpdatedTime);
        console.log(`Fetched ${allBooksData.length} books from LiveLib`);
    }

    const readBooks = allBooksData.filter(b => b['Exclusive Shelf'] === 'read');
    const readingBooks = allBooksData.filter(b => b['Exclusive Shelf'] === 'currently-reading');
    const wishBooks = allBooksData.filter(b => b['Exclusive Shelf'] === 'to-read');

    return {
        allBooks: allBooksData,
        lastUpdated: lastUpdatedTime,
        books: new (getBookCollection())(readBooks, customDates),
        currentBooks: new (getBookCollection())(readingBooks, customDates),
        toReadBooks: new (getBookCollection())(wishBooks, customDates)
    };
}

// ============================================
// UI Rendering Functions
// ============================================

function renderHeroStats(books) {
    const totalBooks = books.models.length;
    const totalPages = books.models.reduce((sum, b) => sum + (b['Number of Pages'] || 0), 0);
    const booksThisYear = books.models.filter(b => {
        const dateRead = b['Date Read'];
        return dateRead && dateRead.startsWith(currentYear.toString());
    }).length;
    
    const progressPercent = Math.min((booksThisYear / readingChallengeGoal) * 100, 100).toFixed(0);

    document.getElementById('total-books').textContent = totalBooks.toLocaleString('ru-RU');
    document.getElementById('total-pages').textContent = totalPages.toLocaleString('ru-RU');
    document.getElementById('total-this-year').textContent = booksThisYear;
    document.getElementById('challenge-progress').textContent = `${progressPercent}%`;
    document.getElementById('challenge-bar').style.width = `${progressPercent}%`;
}

async function renderCurrentBook(currentBooks) {
    const container = document.getElementById('current-book-container');
    const noReadingMsg = document.getElementById('no-reading-message');
    
    if (currentBooks.models.length > 0) {
        noReadingMsg.classList.add('hidden');
        const book = currentBooks.models[0];
        const author = await book.getDisplayAuthor();
        const pages = await book.loadCustomPages();
        
        // Try to get reading progress from Hardcover API
        let progressData = null;
        let progressHtml = '';
        
        try {
            const apiKey = await getHardcoverApiKey();
            if (apiKey) {
                progressData = await getBookProgress(book.Title, author, apiKey);
                
                if (progressData && progressData.percentage > 0) {
                    const percentage = Math.round(progressData.percentage);
                    const currentPage = progressData.currentPage || 0;
                    const totalPages = progressData.totalPages || 0;
                    
                    progressHtml = `
                        <div class="current-book-progress">
                            <div class="progress-header">
                                <span class="progress-label">
                                    <i class="fas fa-book-reader"></i>
                                    Прогресс чтения
                                </span>
                                <span class="progress-percentage">${percentage}%</span>
                            </div>
                            <div class="progress-bar-container">
                                <div class="progress-bar-fill" style="width: ${percentage}%"></div>
                            </div>
                            ${currentPage > 0 && totalPages > 0 ? `
                                <div class="progress-details">
                                    <span class="progress-pages">${currentPage} / ${totalPages} страниц</span>
                                </div>
                            ` : ''}
                        </div>
                    `;
                }
            }
        } catch (error) {
            console.warn('Could not fetch reading progress:', error);
            // Continue without progress if API fails
        }
        
        container.innerHTML = `
            <div class="current-book-display">
                <img src="${book.getCoverUrl()}" 
                     alt="${book.Title}" 
                     class="current-book-cover"
                     onerror="this.src='https://placehold.co/140x211?text=Нет+обложки'; this.onerror=null;">
                <div class="current-book-info">
                    <h3 class="current-book-title">
                        <a href="${book.getLiveLibBookLink()}" target="_blank">${book.Title}</a>
                    </h3>
                    <p class="current-book-author">
                        <i class="fas fa-user"></i>
                        ${author}
                    </p>
                    ${pages !== 'N/A' ? `
                        <p class="current-book-pages">
                            <i class="fas fa-scroll"></i>
                            ${pages} страниц
                        </p>
                    ` : `
                        <p class="current-book-pages pages-unknown">
                            <i class="fas fa-scroll"></i>
                            <span class="unknown-text">Не указано</span>
                        </p>
                    `}
                    ${book.Cycle ? `<p class="current-book-cycle"><i class="fas fa-sync-alt"></i> ${book.getCycleDisplay()?.fullDisplay || ''}</p>` : ''}
                    ${progressHtml}
                </div>
            </div>
        `;
    } else {
        container.innerHTML = '';
        noReadingMsg.classList.remove('hidden');
    }
}

async function renderLastReadBook(books) {
    const container = document.getElementById('last-read-container');
    const lastReadBook = books.getLastReadBook();
    
    if (lastReadBook) {
        const author = await lastReadBook.getDisplayAuthor();
        const pages = await lastReadBook.loadCustomPages();
        const readDate = lastReadBook.formatReadDate();
        
        container.innerHTML = `
            <div class="last-read-display">
                <img src="${lastReadBook.getCoverUrl()}" 
                     alt="${lastReadBook.Title}" 
                     class="last-read-cover"
                     onerror="this.src='https://placehold.co/70x105?text=Нет+обложки'; this.onerror=null;">
                <div class="last-read-info">
                    <h4 class="last-read-title">
                        <a href="${lastReadBook.getLiveLibBookLink()}" target="_blank">${lastReadBook.Title}</a>
                    </h4>
                    <p class="last-read-meta">${author}</p>
                    <p class="last-read-meta">${readDate}</p>
                </div>
            </div>
        `;
    } else {
        container.innerHTML = '<p class="text-gray-500">Нет данных</p>';
    }
}

async function renderTopAuthors(books) {
    const container = document.getElementById('most-prolific-author-container');
    
    // Get top 2 authors
    const authorCounts = {};
    for (const book of books.allBooks) {
        if (book['Exclusive Shelf'] === 'read') {
            const displayAuthor = await book.getDisplayAuthor();
            authorCounts[displayAuthor] = (authorCounts[displayAuthor] || 0) + 1;
        }
    }
    
    const topAuthors = Object.entries(authorCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2);
    
    if (topAuthors.length === 0) {
        container.innerHTML = '<p class="text-gray-500">Нет данных</p>';
        return;
    }
    
    // Get photos for all authors
    const authorsWithPhotos = await Promise.all(
        topAuthors.map(async ([author, count]) => {
            const photoUrl = await books.getAuthorPhoto(author);
            return { author, count, photoUrl };
        })
    );
    
    container.innerHTML = `
        <div class="top-authors-list">
            ${authorsWithPhotos.map(({ author, count, photoUrl }, index) => `
                <div class="author-item">
                    <div class="author-rank">${index + 1}</div>
                    <img src="${photoUrl}" 
                         alt="${author}" 
                         class="author-photo-small"
                         onerror="this.src='https://via.placeholder.com/50?text=${encodeURIComponent(author)}'; this.onerror=null;">
                    <div class="author-info-compact">
                        <h5 class="author-name-small">${author}</h5>
                        <p class="author-count-small">${getBookDeclension(count)}</p>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function renderBookRecords(books) {
    const container = document.getElementById('book-records-container');
    
    if (books.models.length === 0) {
        container.innerHTML = '<p class="text-gray-500">Нет данных</p>';
        return;
    }
    
    const longestBook = books.models.reduce((a, b) => 
        (b['Number of Pages'] || 0) > (a['Number of Pages'] || 0) ? b : a
    );
    const shortestBook = books.models.reduce((a, b) => 
        (b['Number of Pages'] || Infinity) < (a['Number of Pages'] || Infinity) ? b : a
    );
    
    container.innerHTML = `
        <div class="records-list">
            <div class="record-item">
                <i class="fas fa-arrow-up text-primary"></i>
                <div>
                    <strong>Самая длинная:</strong>
                    <p>${longestBook.Title} ${longestBook['Number of Pages'] && longestBook['Number of Pages'] > 0 ? `(${longestBook['Number of Pages']} стр.)` : '<span class="unknown-text">(не указано)</span>'}</p>
                </div>
            </div>
            <div class="record-item">
                <i class="fas fa-arrow-down text-primary"></i>
                <div>
                    <strong>Самая короткая:</strong>
                    <p>${shortestBook.Title} ${shortestBook['Number of Pages'] && shortestBook['Number of Pages'] > 0 ? `(${shortestBook['Number of Pages']} стр.)` : '<span class="unknown-text">(не указано)</span>'}</p>
                </div>
            </div>
        </div>
    `;
}

function renderReadingStats(books) {
    const container = document.getElementById('reading-stats-container');
    
    const totalBooks = books.models.length;
    const totalPages = books.models.reduce((sum, b) => sum + (b['Number of Pages'] || 0), 0);
    const months = new Set(books.models.map(b => b['Date Read']?.slice(0, 7)).filter(Boolean));
    const avgBooksPerMonth = months.size ? (totalBooks / months.size).toFixed(1) : 0;
    const avgPagesPerMonth = months.size ? (totalPages / months.size).toFixed(0) : 0;
    
    const seriesCounts = {};
    books.models.forEach(b => {
        if (b.Series) {
            seriesCounts[b.Series] = (seriesCounts[b.Series] || 0) + 1;
        }
    });
    
    container.innerHTML = `
        <div class="detailed-stat-content">
            <div class="stat-item">
                <span class="stat-item-label">Всего книг</span>
                <span class="stat-item-value">${totalBooks.toLocaleString('ru-RU')}</span>
            </div>
            <div class="stat-item">
                <span class="stat-item-label">Всего страниц</span>
                <span class="stat-item-value">${totalPages.toLocaleString('ru-RU')}</span>
            </div>
            <div class="stat-item">
                <span class="stat-item-label">В среднем книг/месяц</span>
                <span class="stat-item-value">${avgBooksPerMonth}</span>
            </div>
            <div class="stat-item">
                <span class="stat-item-label">В среднем страниц/месяц</span>
                <span class="stat-item-value">${avgPagesPerMonth.toLocaleString('ru-RU')}</span>
            </div>
            <div class="stat-item">
                <span class="stat-item-label">Серий прочитано</span>
                <span class="stat-item-value">${Object.keys(seriesCounts).length}</span>
            </div>
        </div>
    `;
}

async function renderBookCard(book) {
    const author = await book.getDisplayAuthor();
    const pages = await book.loadCustomPages();
    const rating = parseFloat(book['My Rating']) || 0;
    const readDate = book.formatReadDate();
    const genres = book.getDisplayGenres();
    const cycleDisplay = book.getCycleDisplay();
    
    const fullStars = Math.floor(rating);
    const halfStar = rating % 1 >= 0.5 ? 1 : 0;
    const emptyStars = 5 - fullStars - halfStar;
    
    let starsHtml = '';
    for (let i = 0; i < fullStars; i++) starsHtml += '<i class="fas fa-star"></i>';
    if (halfStar) starsHtml += '<i class="fas fa-star-half-alt"></i>';
    for (let i = 0; i < emptyStars; i++) starsHtml += '<i class="far fa-star"></i>';
    
    const card = document.createElement('div');
    card.className = 'book-card';
    const pagesDisplay = pages && pages !== 'N/A' && pages > 0 ? pages : null;
    
    card.innerHTML = `
        <div class="book-card-cover">
            <img src="${book.getCoverUrl()}" 
                 alt="${book.Title}" 
                 class="book-card-image"
                 onerror="this.src='https://placehold.co/140x211?text=Нет+обложки'; this.onerror=null;">
            <div class="book-card-overlay">
                <div class="book-card-hint">
                    <i class="fas fa-hand-pointer"></i>
                    <span>Нажмите для деталей</span>
                </div>
            </div>
        </div>
        <div class="book-card-body">
            <h3 class="book-card-title">
                <a href="${book.getLiveLibBookLink()}" target="_blank">${book.Title}</a>
            </h3>
            <div class="book-card-meta">
                <i class="fas fa-user"></i>
                <span>${author}</span>
            </div>
            <div class="book-card-footer">
                ${rating > 0 ? `
                    <div class="book-card-rating">
                        <div class="stars">${starsHtml}</div>
                        <span class="rating-value">${rating.toFixed(1)}</span>
                    </div>
                ` : '<div></div>'}
                ${pagesDisplay ? `
                    <div class="book-card-pages">
                        <i class="fas fa-file-alt"></i>
                        <span>${pagesDisplay}</span>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
    
    // Add click handler to show book details modal
    card.addEventListener('click', async (e) => {
        // Don't trigger if clicking on link
        if (e.target.closest('a')) return;
        
        const annotation = await book.getAnnotation();
        const allGenres = genres.length > 0 ? genres.join(', ') : 'Не указаны';
        
        showPopup({
            title: '',
            content: `
                <div class="book-details-modal">
                    <div class="book-details-header">
                        <img src="${book.getCoverUrl()}" 
                             alt="${book.Title}" 
                             class="book-details-cover"
                             onerror="this.src='https://placehold.co/140x211?text=Нет+обложки'; this.onerror=null;">
                        <div class="book-details-info">
                            <h2 class="book-details-title">${book.Title}</h2>
                            <div class="book-details-meta-item">
                                <i class="fas fa-user"></i>
                                <span><strong>Автор:</strong> ${author}</span>
                            </div>
                            ${pages !== 'N/A' ? `
                                <div class="book-details-meta-item">
                                    <i class="fas fa-scroll"></i>
                                    <span><strong>Страниц:</strong> ${pages}</span>
                                </div>
                            ` : `
                                <div class="book-details-meta-item pages-unknown">
                                    <i class="fas fa-scroll"></i>
                                    <span><strong>Страниц:</strong> <span class="unknown-text">Не указано</span></span>
                                </div>
                            `}
                            ${readDate ? `
                                <div class="book-details-meta-item">
                                    <i class="fas fa-calendar"></i>
                                    <span><strong>Прочитано:</strong> ${readDate}</span>
                                </div>
                            ` : ''}
                            ${cycleDisplay ? `
                                <div class="book-details-meta-item">
                                    <i class="fas fa-sync-alt"></i>
                                    <span><strong>${cycleDisplay.baseName}:</strong> ${cycleDisplay.fullDisplay}</span>
                                </div>
                            ` : ''}
                            <div class="book-details-meta-item">
                                <i class="fas fa-tags"></i>
                                <span><strong>Жанры:</strong> ${allGenres}</span>
                            </div>
                            ${rating > 0 ? `
                                <div class="book-details-meta-item">
                                    <i class="fas fa-star"></i>
                                    <span><strong>Оценка:</strong> 
                                        <span class="book-details-rating">
                                            ${starsHtml} ${rating.toFixed(1)}
                                        </span>
                                    </span>
                                </div>
                            ` : ''}
                            <div class="book-details-actions">
                                <a href="${book.getLiveLibBookLink()}" target="_blank" class="book-details-link">
                                    <i class="fas fa-external-link-alt"></i>
                                    Открыть на LiveLib
                                </a>
                            </div>
                        </div>
                    </div>
                    <div class="book-details-annotation">
                        <h3 class="book-details-section-title">
                            <i class="fas fa-book-open"></i>
                            Аннотация
                        </h3>
                        <p class="annotation-text">${annotation}</p>
                    </div>
                </div>
            `
        });
    });
    
    return card;
}

async function renderBooksList(books, containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    
    const startIndex = books.currentPage * books.booksPerPage;
    const endIndex = startIndex + books.booksPerPage;
    const booksToRender = books.models.slice(startIndex, endIndex);
    
    if (booksToRender.length === 0 && books.currentPage === 0) {
        container.innerHTML = '<p class="text-center text-gray-500">Нет книг для отображения</p>';
        return;
    }
    
    const cards = await Promise.all(booksToRender.map(book => renderBookCard(book)));
    cards.forEach(card => container.appendChild(card));
    
    const loadMoreContainer = document.getElementById('load-more-container');
    if (loadMoreContainer) {
        loadMoreContainer.style.display = endIndex < books.models.length ? 'block' : 'none';
    }
}

async function renderSeries(books, containerId, isCycle = false) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    
    const readBooks = books.allBooks.filter(book => book['Exclusive Shelf'] === 'read');
    
    if (readBooks.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500">Нет данных для отображения</p>';
        return;
    }
    
    const grouped = {};
    
    for (const book of readBooks) {
        let groupKey = null;
        let author = null;
        
        if (isCycle) {
            const cycleDisplay = book.getCycleDisplay();
            if (cycleDisplay && cycleDisplay.baseName) {
                groupKey = cycleDisplay.baseName;
                author = await book.getDisplayAuthor();
            }
        } else {
            const seriesDisplay = book.getSeriesDisplay();
            if (seriesDisplay && typeof seriesDisplay === 'string') {
                groupKey = seriesDisplay;
                author = await book.getDisplayAuthor();
            }
        }
        
        if (groupKey) {
            if (!grouped[groupKey]) {
                grouped[groupKey] = { books: [], author };
            }
            grouped[groupKey].books.push(book);
        }
    }
    
    if (Object.keys(grouped).length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500">Нет данных для отображения</p>';
        return;
    }
    
    for (const [groupName, data] of Object.entries(grouped)) {
        const { books: groupBooks, author } = data;
        
        // Sort books
        if (isCycle) {
            groupBooks.sort((a, b) => {
                const aNum = a.Cycle?.number || 0;
                const bNum = b.Cycle?.number || 0;
                return aNum - bNum;
            });
        } else {
            groupBooks.sort((a, b) => a.Title.localeCompare(b.Title));
        }
        
        const seriesDiv = document.createElement('div');
        // Добавляем класс 'large' для серий с большим количеством книг
        const bookCount = groupBooks.length;
        seriesDiv.className = `series-item ${bookCount >= 8 ? 'large' : ''}`;
        
        const headerDiv = document.createElement('div');
        headerDiv.className = 'series-header';
        headerDiv.innerHTML = `
            <div>
                <h3 class="series-title">${isCycle ? '🔄' : '📚'} ${groupName}</h3>
                <p class="series-author">Автор: ${author}</p>
            </div>
        `;
        
        const booksDiv = document.createElement('div');
        booksDiv.className = 'series-books';
        
        groupBooks.forEach((book) => {
            const bookDiv = document.createElement('div');
            bookDiv.className = 'series-book';
            
            const cycleDisplay = book.getCycleDisplay();
            const numberText = isCycle && book.Cycle?.number ? `№${book.Cycle.number}` : '';
            
            bookDiv.innerHTML = `
                <a href="${book.getLiveLibBookLink()}" target="_blank" title="${book.Title}">
                    <img src="${book.getCoverUrl()}" 
                         alt="${book.Title}" 
                         onerror="this.src='https://placehold.co/70x105?text=Нет+обложки'; this.onerror=null;">
                    ${numberText ? `<span class="series-book-number">${numberText}</span>` : ''}
                </a>
            `;
            
            booksDiv.appendChild(bookDiv);
        });
        
        // Add count badge in top right corner
        const countBadge = document.createElement('span');
        countBadge.className = 'series-count';
        countBadge.innerHTML = `<i class="fas fa-book"></i> ${groupBooks.length}`;
        
        seriesDiv.appendChild(headerDiv);
        seriesDiv.appendChild(booksDiv);
        seriesDiv.appendChild(countBadge);
        container.appendChild(seriesDiv);
    }
}

function renderLiveLibBadges() {
    const challengeLink = document.getElementById('livelib-challenge-link');
    const challengeImg = document.getElementById('livelib-challenge-img');
    const profileLink = document.getElementById('livelib-profile-link');
    const profileImg = document.getElementById('livelib-profile-img');
    
    if (challengeLink && challengeImg) {
        challengeLink.href = `https://www.livelib.ru/challenge/${currentYear}/reader/${username}`;
        challengeImg.src = `https://u.livelib.ru/reader/${username}/challenge${currentYear}.png`;
        challengeImg.alt = 'LiveLib Challenge';
    }
    
    if (profileLink && profileImg) {
        profileLink.href = `https://www.livelib.ru/reader/${username}`;
        profileImg.src = `https://u.livelib.ru/reader/${username}/informer-i3.png`;
        profileImg.alt = 'LiveLib Profile';
    }
}

async function renderCharts(books) {
    // Timeline Chart - Modern Area Chart with Gradient
    const timelineData = {};
    for (const book of books.allBooks) {
        if (book['Exclusive Shelf'] === 'read' && book['Date Read']) {
            const [year, month] = book['Date Read'].split('-');
            const key = `${year}-${month}`;
            timelineData[key] = (timelineData[key] || 0) + 1;
        }
    }
    
    const sortedKeys = Object.keys(timelineData).sort();
    const timelineSeries = sortedKeys.map(key => timelineData[key]);
    const timelineLabels = sortedKeys.map(key => {
        const [year, month] = key.split('-');
        const monthNames = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
        return `${monthNames[parseInt(month) - 1]} ${year.slice(2)}`;
    });
    
    new ApexCharts(document.querySelector("#timelineChart"), {
        chart: { 
            type: 'area', 
            height: 350, 
            toolbar: { show: false },
            animations: { enabled: true, easing: 'easeinout', speed: 800 },
            sparkline: { enabled: false }
        },
        series: [{ 
            name: 'Книг прочитано', 
            data: timelineSeries 
        }],
        xaxis: { 
            categories: timelineLabels,
            labels: {
                style: {
                    colors: '#6b7280',
                    fontSize: '12px',
                    fontFamily: 'Inter, sans-serif'
                },
                rotate: -45,
                rotateAlways: false
            },
            axisBorder: {
                show: true,
                color: '#e5e7eb'
            }
        },
        yaxis: {
            labels: {
                style: {
                    colors: '#6b7280',
                    fontSize: '12px',
                    fontFamily: 'Inter, sans-serif'
                }
            }
        },
        fill: {
            type: 'gradient',
            gradient: {
                shadeIntensity: 1,
                opacityFrom: 0.7,
                opacityTo: 0.3,
                stops: [0, 90, 100],
                colorStops: [
                    { offset: 0, color: '#6366f1', opacity: 1 },
                    { offset: 50, color: '#8b5cf6', opacity: 0.8 },
                    { offset: 100, color: '#ec4899', opacity: 0.4 }
                ]
            }
        },
        stroke: {
            curve: 'smooth',
            width: 3,
            colors: ['#6366f1']
        },
        colors: ['#6366f1'],
        dataLabels: { enabled: false },
        grid: {
            borderColor: '#e5e7eb',
            strokeDashArray: 4,
            xaxis: { lines: { show: false } },
            yaxis: { lines: { show: true } },
            padding: { top: 0, right: 0, bottom: 0, left: 0 }
        },
        tooltip: {
            theme: 'light',
            style: { fontSize: '14px', fontFamily: 'Inter, sans-serif' },
            y: { formatter: (val) => `${val} ${val === 1 ? 'книга' : val < 5 ? 'книги' : 'книг'}` }
        },
        markers: {
            size: 5,
            colors: ['#6366f1'],
            strokeColors: '#fff',
            strokeWidth: 2,
            hover: { size: 7 }
        }
    }).render();
    
    // Rating Chart - Modern Horizontal Bar Chart
    const ratingCounts = { '1': 0, '1.5': 0, '2': 0, '2.5': 0, '3': 0, '3.5': 0, '4': 0, '4.5': 0, '5': 0 };
    for (const book of books.allBooks) {
        if (book['Exclusive Shelf'] === 'read' && book['My Rating'] > 0) {
            const rating = Math.round(book['My Rating'] * 2) / 2;
            ratingCounts[rating.toString()] = (ratingCounts[rating.toString()] || 0) + 1;
        }
    }
    
    const filteredRatings = Object.entries(ratingCounts)
        .filter(([_, count]) => count > 0)
        .sort(([a], [b]) => parseFloat(a) - parseFloat(b));
    
    const ratingSeries = filteredRatings.map(([_, count]) => count);
    const ratingLabels = filteredRatings.map(([rating]) => {
        const numStars = parseFloat(rating);
        const fullStars = Math.floor(numStars);
        const halfStar = numStars % 1 === 0.5 ? '½' : '';
        return '★'.repeat(fullStars) + halfStar + '☆'.repeat(5 - Math.ceil(numStars));
    });
    
    new ApexCharts(document.querySelector("#ratingChart"), {
        chart: { 
            type: 'bar', 
            height: 350, 
            toolbar: { show: false },
            animations: { enabled: true, easing: 'easeinout', speed: 800 }
        },
        series: [{ 
            name: 'Количество книг', 
            data: ratingSeries 
        }],
        xaxis: { 
            categories: ratingLabels,
            labels: {
                style: {
                    colors: '#6b7280',
                    fontSize: '12px',
                    fontFamily: 'Inter, sans-serif'
                }
            }
        },
        yaxis: {
            labels: {
                style: {
                    colors: '#6b7280',
                    fontSize: '12px',
                    fontFamily: 'Inter, sans-serif'
                }
            }
        },
        plotOptions: {
            bar: {
                borderRadius: 8,
                horizontal: false,
                columnWidth: '60%',
                dataLabels: {
                    position: 'top'
                }
            }
        },
        fill: {
            type: 'gradient',
            gradient: {
                shade: 'light',
                type: 'vertical',
                shadeIntensity: 0.5,
                gradientToColors: ['#8b5cf6'],
                inverseColors: false,
                opacityFrom: 1,
                opacityTo: 0.8,
                stops: [0, 100]
            }
        },
        colors: ['#6366f1'],
        dataLabels: { 
            enabled: true,
            style: {
                colors: ['#fff'],
                fontSize: '12px',
                fontFamily: 'Inter, sans-serif',
                fontWeight: 600
            },
            offsetY: -20,
            formatter: (val) => val > 0 ? val : ''
        },
        grid: {
            borderColor: '#e5e7eb',
            strokeDashArray: 4,
            xaxis: { lines: { show: false } },
            yaxis: { lines: { show: true } },
            padding: { top: 20, right: 0, bottom: 0, left: 0 }
        },
        tooltip: {
            theme: 'light',
            style: { fontSize: '14px', fontFamily: 'Inter, sans-serif' },
            y: { formatter: (val) => `${val} ${val === 1 ? 'книга' : val < 5 ? 'книги' : 'книг'}` }
        }
    }).render();
    
    // Genre Chart - Modern Horizontal Bar Chart
    const genreCounts = {};
    for (const book of books.allBooks) {
        if (book['Exclusive Shelf'] === 'read') {
            const genres = book.Genres || [];
            genres.forEach(genre => {
                genreCounts[genre] = (genreCounts[genre] || 0) + 1;
            });
        }
    }
    
    const topGenres = Object.entries(genreCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
    
    const genreSeries = topGenres.map(([_, count]) => count);
    const genreLabels = topGenres.map(([genre]) => genre);
    const totalBooks = genreSeries.reduce((a, b) => a + b, 0);
    const genreColors = ['#6366f1', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b'];
    
    new ApexCharts(document.querySelector("#genreChart"), {
        chart: { 
            type: 'bar', 
            height: 350, 
            toolbar: { show: false },
            animations: { enabled: true, easing: 'easeinout', speed: 800 }
        },
        series: [{ 
            name: 'Количество книг', 
            data: genreSeries 
        }],
        xaxis: { 
            categories: genreLabels,
            labels: {
                style: {
                    colors: '#374151',
                    fontSize: '13px',
                    fontFamily: 'Inter, sans-serif',
                    fontWeight: 500
                }
            }
        },
        yaxis: {
            labels: {
                style: {
                    colors: '#6b7280',
                    fontSize: '12px',
                    fontFamily: 'Inter, sans-serif'
                }
            }
        },
        plotOptions: {
            bar: {
                borderRadius: 6,
                horizontal: true,
                barHeight: '70%',
                distributed: true,
                dataLabels: {
                    position: 'right'
                }
            }
        },
        fill: {
            type: 'gradient',
            gradient: {
                shade: 'light',
                type: 'horizontal',
                shadeIntensity: 0.5,
                gradientToColors: genreColors,
                inverseColors: false,
                opacityFrom: 1,
                opacityTo: 0.9,
                stops: [0, 100]
            }
        },
        colors: genreColors,
        dataLabels: { 
            enabled: true,
            style: {
                colors: ['#374151'],
                fontSize: '13px',
                fontFamily: 'Inter, sans-serif',
                fontWeight: 600
            },
            offsetX: 10,
            formatter: (val) => {
                const percent = ((val / totalBooks) * 100).toFixed(1);
                return `${val} (${percent}%)`;
            }
        },
        grid: {
            borderColor: '#e5e7eb',
            strokeDashArray: 4,
            xaxis: { lines: { show: true } },
            yaxis: { lines: { show: false } },
            padding: { top: 0, right: 20, bottom: 0, left: 0 }
        },
        tooltip: {
            theme: 'light',
            style: { fontSize: '14px', fontFamily: 'Inter, sans-serif' },
            y: { 
                formatter: (val) => {
                    const percent = ((val / totalBooks) * 100).toFixed(1);
                    return `${val} ${val === 1 ? 'книга' : val < 5 ? 'книги' : 'книг'} (${percent}%)`;
                }
            }
        }
    }).render();
}

// ============================================
// Popup Modal
// ============================================

function showPopup({ title = '', content = '' }) {
    const modal = document.getElementById('popup-modal');
    const body = document.getElementById('popup-body');
    
    body.innerHTML = `
        ${title ? `<h3 style="margin-bottom: 1rem; font-size: 1.25rem; font-weight: 600;">${title}</h3>` : ''}
        ${content}
    `;
    
    modal.classList.remove('hidden');
    
    // Close handlers
    const closeBtn = modal.querySelector('.popup-close');
    const overlay = modal.querySelector('.popup-overlay');
    
    const closeModal = () => {
        modal.classList.add('hidden');
    };
    
    closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', closeModal);
}

// ============================================
// Event Handlers
// ============================================

function setupEventHandlers() {
    // Tab switching for Books section only (separate from series/cycles)
    const booksSection = document.querySelector('.books-section');
    if (booksSection) {
        const booksTabButtons = booksSection.querySelectorAll('.tab-btn');
        const booksTabPanes = booksSection.querySelectorAll('.tab-content');
        
        booksTabButtons.forEach(button => {
            button.addEventListener('click', async () => {
                // Remove active from all in this section
                booksTabButtons.forEach(btn => btn.classList.remove('active'));
                booksTabPanes.forEach(pane => pane.classList.remove('active'));
                
                // Add active to clicked
                button.classList.add('active');
                const tabId = button.getAttribute('data-tab');
                const activePane = document.getElementById(tabId);
                if (activePane) {
                    activePane.classList.add('active');
                    
                    // Handle content rendering
                    if (tabId === 'read-books-tab') {
                        // Reset to original books collection (without filters)
                        const booksToRender = originalBooks || books;
                        if (booksToRender && booksToRender.allBooks) {
                            booksToRender.currentPage = 0;
                            booksToRender.booksPerPage = 12;
                            // Reset models to all books
                            booksToRender.models = [...booksToRender.allBooks];
                            booksToRender.sortBy(document.getElementById('sort-by')?.value || 'date-desc');
                            await renderBooksList(booksToRender, 'book-list');
                        }
                    } else if (tabId === 'future-books-tab') {
                        // Render future books
                        const futureContainer = document.getElementById('future-reads');
                        if (toReadBooks && toReadBooks.models && toReadBooks.models.length > 0) {
                            toReadBooks.currentPage = 0;
                            toReadBooks.booksPerPage = 12;
                            await renderBooksList(toReadBooks, 'future-reads');
                        } else {
                            if (futureContainer) {
                                futureContainer.innerHTML = 
                                    '<p class="text-center text-gray-500">Нет книг для чтения</p>';
                            }
                        }
                    }
                }
            });
        });
    }
    
    // Tab switching for Series/Cycles section (separate handler)
    const seriesSection = document.querySelector('.series-section');
    if (seriesSection) {
        const seriesTabButtons = seriesSection.querySelectorAll('.tab-btn');
        const seriesTabPanes = seriesSection.querySelectorAll('.tab-content');
        
        seriesTabButtons.forEach(button => {
            button.addEventListener('click', () => {
                // Remove active from all in this section
                seriesTabButtons.forEach(btn => btn.classList.remove('active'));
                seriesTabPanes.forEach(pane => pane.classList.remove('active'));
                
                // Add active to clicked
                button.classList.add('active');
                const tabId = button.getAttribute('data-tab');
                const activePane = document.getElementById(tabId);
                if (activePane) {
                    activePane.classList.add('active');
                }
            });
        });
    }
    
    // Filters
    const genreFilter = document.getElementById('genre-filter');
    const sortBy = document.getElementById('sort-by');
    
    const applyFilters = async () => {
        // Only apply filters if we're on the read-books tab
        const readBooksTab = document.getElementById('read-books-tab');
        if (!readBooksTab || !readBooksTab.classList.contains('active')) {
            return;
        }
        
        // Create a copy of books for filtering
        const filteredBooks = new (getBookCollection())(
            books.allBooks.filter(book => {
                if (genreFilter?.value) {
                    return book.Genres && book.Genres.includes(genreFilter.value);
                }
                return true;
            }),
            books.customDates
        );
        filteredBooks.sortBy(sortBy?.value || 'date-desc');
        filteredBooks.currentPage = 0;
        filteredBooks.booksPerPage = 12;
        await renderBooksList(filteredBooks, 'book-list');
    };
    
    genreFilter?.addEventListener('change', applyFilters);
    sortBy?.addEventListener('change', applyFilters);
    
    // Load more
    document.getElementById('load-more')?.addEventListener('click', async () => {
        books.currentPage += 1;
        await renderBooksList(books, 'book-list');
    });
    
    // Floating actions panel toggle
    const floatingToggle = document.getElementById('floating-actions-toggle');
    const floatingPanel = document.getElementById('floating-actions-panel');
    const floatingClose = document.getElementById('floating-actions-close');
    
    floatingToggle?.addEventListener('click', () => {
        floatingPanel?.classList.toggle('active');
    });
    
    floatingClose?.addEventListener('click', () => {
        floatingPanel?.classList.remove('active');
    });
    
    // Close panel when clicking outside
    document.addEventListener('click', (e) => {
        if (floatingPanel?.classList.contains('active') && 
            !floatingPanel.contains(e.target) && 
            !floatingToggle?.contains(e.target)) {
            floatingPanel.classList.remove('active');
        }
    });
    
    // Refresh button
    document.getElementById('refresh-button')?.addEventListener('click', async () => {
        const btn = document.getElementById('refresh-button');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Загрузка...</span>';
        
        try {
            const { customPages, bookAnnotations, customDates } = await loadStaticData();
            const refreshed = await fetchAndCategorizeBooks(bookAnnotations, customPages, customDates);
            
            allBooks = refreshed.allBooks;
            lastUpdated = refreshed.lastUpdated;
            books = refreshed.books;
            originalBooks = refreshed.books; // Обновляем оригинальную коллекцию
            currentBooks = refreshed.currentBooks;
            toReadBooks = refreshed.toReadBooks;
            
            await renderAll();
            document.getElementById('last-updated-timestamp').textContent = 
                new Date(lastUpdated).toLocaleString('ru-RU');
            
            showPopup({
                title: 'Успешно!',
                content: '<p style="color: #10b981;">Данные успешно обновлены</p>'
            });
        } catch (error) {
            console.error('Refresh error:', error);
            showPopup({
                title: 'Ошибка',
                content: `<p style="color: #ef4444;">Не удалось обновить данные: ${error.message}</p>`
            });
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-sync-alt"></i> <span>Обновить данные</span>';
        }
    });
    
    // Copy list button
    document.getElementById('copy-book-list')?.addEventListener('click', () => {
        const formats = [
            { name: 'Простой список', format: (book) => `${book.Title} - ${book.Authors || 'Неизвестный автор'}` },
            { name: 'С оценками', format: (book) => `${book.Title} - ${book.Authors || 'Неизвестный автор'} (${book['My Rating'] || 'нет оценки'})` },
            { name: 'С датами', format: (book) => `${book.Title} - ${book.Authors || 'Неизвестный автор'} (${book['Date Read'] || 'нет даты'})` }
        ];
        
        showPopup({
            title: 'Выберите формат списка',
            content: `
                <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                    ${formats.map((fmt, idx) => `
                        <button class="action-btn primary" style="width: 100%;" data-format="${idx}">
                            ${fmt.name}
                        </button>
                    `).join('')}
                </div>
            `
        });
        
        setTimeout(() => {
            document.querySelectorAll('[data-format]').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const format = formats[parseInt(btn.dataset.format)];
                    const list = books.models.map(book => format.format(book)).join('\n');
                    await navigator.clipboard.writeText(list);
                    showPopup({
                        title: 'Готово!',
                        content: '<p style="color: #10b981;">Список скопирован в буфер обмена</p>'
                    });
                });
            });
        }, 100);
    });
}

// ============================================
// Main Render Function
// ============================================

async function renderAll() {
    // Update heading
    const heading = document.getElementById('site-heading');
    if (heading && username) {
        heading.textContent = `Книжный путь: ${username}`;
    }
    
    // Render all sections
    renderHeroStats(books);
    await renderCurrentBook(currentBooks);
    await renderLastReadBook(books);
    await renderTopAuthors(books);
    renderBookRecords(books);
    renderReadingStats(books);
    renderLiveLibBadges();
    
    // Setup genre filter
    const genreFilter = document.getElementById('genre-filter');
    if (genreFilter) {
        const uniqueGenres = [...new Set(allBooks.flatMap(book => book.Genres || []))].sort();
        genreFilter.innerHTML = '<option value="">Все жанры</option>' + 
            uniqueGenres.map(genre => `<option value="${genre}">${genre}</option>`).join('');
    }
    
    // Render books
    books.currentPage = 0;
    books.booksPerPage = 12;
    books.sortBy('date-desc');
    await renderBooksList(books, 'book-list');
    
    // Render future books
    if (toReadBooks.models.length > 0) {
        await renderBooksList(toReadBooks, 'future-reads');
    } else {
        document.getElementById('future-reads').innerHTML = 
            '<p class="text-center text-gray-500">Нет книг для чтения</p>';
    }
    
    // Render series and cycles
    await renderSeries(books, 'cycle-shelf', true);
    await renderSeries(books, 'series-shelf', false);
    
    // Render charts
    await renderCharts(books);
    
    // Update timestamp
    if (lastUpdated) {
        document.getElementById('last-updated-timestamp').textContent = 
            new Date(lastUpdated).toLocaleString('ru-RU');
    }
}

// ============================================
// Wait for classes to be available
// ============================================

// Helper to get BookCollection class
function getBookCollection() {
    // Classes should be available on window after the inline script runs
    if (window.BookCollection) {
        return window.BookCollection;
    }
    // Fallback: try global scope (may work in some browsers)
    if (typeof BookCollection !== 'undefined') {
        return BookCollection;
    }
    throw new Error('BookCollection class not found. Make sure js/book_collection.js is loaded before this module.');
}

function waitForClasses() {
    return new Promise((resolve) => {
        const checkClasses = () => {
            try {
                // Check if we can access the classes
                getBookCollection();
                return true;
            } catch (e) {
                return false;
            }
        };
        
        if (checkClasses()) {
            resolve();
            return;
        }
        
        // Wait for classes to be available
        const checkInterval = setInterval(() => {
            if (checkClasses()) {
                clearInterval(checkInterval);
                resolve();
            }
        }, 50);
        
        // Timeout after 5 seconds
        setTimeout(() => {
            clearInterval(checkInterval);
            if (!checkClasses()) {
                throw new Error('Book or BookCollection classes not found. Make sure js/book.js and js/book_collection.js are loaded before the module.');
            }
            resolve();
        }, 5000);
    });
}

// ============================================
// Initialization
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Wait for Book and BookCollection classes to be available
        await waitForClasses();
        
        await loadConfig();
        
        const { customPages, bookAnnotations, customDates } = await loadStaticData();
        const data = await fetchAndCategorizeBooks(bookAnnotations, customPages, customDates);
        
        allBooks = data.allBooks;
        lastUpdated = data.lastUpdated;
        books = data.books;
        originalBooks = data.books; // Сохраняем оригинальную коллекцию
        currentBooks = data.currentBooks;
        toReadBooks = data.toReadBooks;
        
        setupEventHandlers();
        await renderAll();
        
    } catch (error) {
        console.error('Initialization error:', error);
        showPopup({
            title: 'Ошибка загрузки',
            content: `<p style="color: #ef4444;">Не удалось загрузить данные: ${error.message}</p>`
        });
    }
});

