// Comprehensive bot/crawler/headless UA filter, shared by analytics + live-visitor tracking.
export const BOT_UA = new RegExp(
  [
    // Generic bot/crawler markers
    "bot", "crawl", "spider", "slurp", "scraper", "scan", "fetch", "checker",
    "monitor", "probe", "ping", "audit", "inspect", "preview", "snapshot",
    // Named crawlers & search engines
    "googlebot", "bingbot", "yandexbot", "baiduspider", "duckduckbot",
    "sogou", "exabot", "facebot", "ia_archiver", "ahrefsbot", "semrushbot",
    "dotbot", "mj12bot", "rogerbot", "screaming frog", "seokicks",
    "sistrix", "linkdexbot", "blexbot", "seobilitybot", "dataforseo",
    "majestic", "serpstat", "bytespider", "petalbot",
    // Social / link preview bots
    "facebookexternalhit", "twitterbot", "linkedinbot", "whatsapp",
    "slackbot", "discordbot", "telegrambot", "viber", "line-poker",
    "applebot", "pinterest", "tumblr",
    // HTTP tools / scripts
    "python", "curl", "wget", "axios", "got", "node-fetch", "java",
    "ruby", "perl", "go-http", "okhttp", "libwww", "lwp",
    "httpclient", "httpunit", "requests", "urllib",
    // Headless browsers
    "headlesschrome", "phantomjs", "selenium", "puppeteer", "playwright",
    "webdriver", "cypress",
    // Security / uptime scanners
    "zgrab", "masscan", "nmap", "nikto", "nuclei", "shodan",
    "censys", "qualys", "netcraft", "uptimerobot", "statuscake",
    "pingdom", "newrelic", "datadog", "freshping", "hetrixtools",
  ].join("|"),
  "i",
);
