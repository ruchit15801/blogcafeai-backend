export function extractPlainText(html) {
    if (!html) return '';
    return String(html).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

export function computeReadTimeMinutesFromHtml(html, wordsPerMinute = 200) {
    const text = extractPlainText(html);
    if (!text) return 0;
    const words = text.split(' ').filter(Boolean).length;
    const minutes = Math.max(1, Math.ceil(words / Math.max(100, wordsPerMinute)));
    return minutes;
}


