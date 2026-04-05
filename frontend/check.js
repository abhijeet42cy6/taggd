import puppeteer from 'puppeteer';

(async () => {
    try {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        
        page.on('response', response => {
            if(response.url().includes('api')) {
              console.log(response.status(), response.url());
            }
        });
        
        await page.goto('http://localhost:3001/', { waitUntil: 'networkidle0' });
        await browser.close();
    } catch (e) {
        console.error(e);
    }
})();
