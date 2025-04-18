export function getBookDeclension(count) {
    if (count % 10 === 1 && count % 100 !== 11) {
        return `${count} книга`;
    } else if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) {
        return `${count} книги`;
    } else {
        return `${count} книг`;
    }
}

export function parseDate(dateStr) {
    if (!dateStr || !dateStr.includes('г.')) return null;
    const [month, year] = dateStr.replace(' г.', '').split(' ');
    const monthMap = {
        'Январь': '01', 'Февраль': '02', 'Март': '03', 'Апрель': '04',
        'Май': '05', 'Июнь': '06', 'Июль': '07', 'Август': '08',
        'Сентябрь': '09', 'Октябрь': '10', 'Ноябрь': '11', 'Декабрь': '12'
    };
    return `${year}-${monthMap[month] || '01'}-01`;
}

export function typeText(element, text, speed = 20) {
    let index = 0;
    element.textContent = '';
    function type() {
        if (index < text.length) {
            element.textContent += text.charAt(index);
            index++;
            setTimeout(type, speed);
        }
    }
    type();
}
window.typeText = typeText;

export function fadeInWords(element, text, speed = 100) {
    const words = text.split(' ');
    element.textContent = '';
    let index = 0;
    function fadeWord() {
        if (index < words.length) {
            const span = document.createElement('span');
            span.textContent = words[index] + ' ';
            span.style.opacity = '0';
            element.appendChild(span);
            setTimeout(() => {
                span.style.transition = 'opacity 0.3s ease';
                span.style.opacity = '1';
            }, 10);
            index++;
            setTimeout(fadeWord, speed);
        }
    }
    fadeWord();
}

export function highlightText(element, text) {
    element.textContent = text;
    setTimeout(() => element.classList.add('visible'), 100);
}

export function slideUpText(element, text, speed = 100) {
    const words = text.split(' ');
    element.textContent = '';
    words.forEach((word, i) => {
        const span = document.createElement('span');
        span.textContent = word + ' ';
        element.appendChild(span);
        setTimeout(() => span.classList.add('visible'), i * speed);
    });
}

// Generic tab-switching function
export function setupTabSwitching({ buttonClass, paneClass, onTabSwitch = () => {} }) {
    const buttons = document.querySelectorAll(`.${buttonClass}`);
    const panes = document.querySelectorAll(`.${paneClass}`);

    buttons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove 'active' class from all buttons and panes
            buttons.forEach(btn => btn.classList.remove('active'));
            panes.forEach(pane => pane.classList.remove('active'));

            // Add 'active' class to the clicked button and corresponding pane
            button.classList.add('active');
            const tabId = button.getAttribute('data-tab');
            const activePane = document.getElementById(tabId);
            if (activePane) {
                activePane.classList.add('active');
                onTabSwitch(tabId, button); // Call the optional callback with tab ID and button
            }
        });
    });
}