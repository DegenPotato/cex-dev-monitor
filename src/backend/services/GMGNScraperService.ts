/**
 * GMGN Chart Scraper Service
 * Uses Puppeteer to monitor GMGN charts and extract indicator values in real-time
 */

import { EventEmitter } from 'events';

// Dynamic import to prevent frontend bundling
let puppeteer: any;
let StealthPlugin: any;
type Browser = any;
type Page = any;

interface ChartMonitor {
  tokenMint: string;
  page: Page;
  interval: string; // 1m, 5m, 15m, 1h, etc
  indicators: string[]; // ['RSI', 'EMA9', 'EMA20', 'MACD']
  lastUpdate: number;
  values: { [indicator: string]: number | null };
}

interface IndicatorValue {
  tokenMint: string;
  timestamp: number;
  interval: string;
  indicator: string;
  value: number;
}

class GMGNScraperService extends EventEmitter {
  private browser: Browser | null = null;
  private monitors: Map<string, ChartMonitor> = new Map();
  private updateInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private debugMode: boolean = false;
  private screenshotDir: string = './screenshots';

  constructor() {
    super();
  }

  /**
   * Enable debug mode (visible browser + screenshots)
   */
  setDebugMode(enabled: boolean) {
    this.debugMode = enabled;
  }

  /**
   * Start the scraper service
   */
  async start() {
    if (this.isRunning) return;

    console.log('🚀 Starting GMGN Scraper Service...');
    
    // Dynamically import puppeteer-extra with stealth plugin
    if (!puppeteer) {
      const puppeteerExtra = await import('puppeteer-extra');
      StealthPlugin = await import('puppeteer-extra-plugin-stealth');
      
      // Use default exports
      puppeteer = puppeteerExtra.default || puppeteerExtra;
      const stealthPlugin = StealthPlugin.default || StealthPlugin;
      
      // Add stealth plugin to evade bot detection
      puppeteer.use(stealthPlugin());
      
      console.log('✅ Stealth plugin loaded - bypassing Cloudflare...');
    }
    
    // Create screenshots directory if it doesn't exist
    const fs = await import('fs');
    if (!fs.existsSync(this.screenshotDir)) {
      fs.mkdirSync(this.screenshotDir, { recursive: true });
    }

    // Launch browser (always headless on server, no X display available)
    this.browser = await puppeteer.launch({
      headless: true, // Always headless - server has no display
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled', // Hide automation
        '--window-size=1920,1080',
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
      ]
    });

    this.isRunning = true;

    // Start update loop (every 5 seconds)
    this.updateInterval = setInterval(() => {
      this.updateAllMonitors();
    }, 5000);

    console.log('✅ GMGN Scraper Service started');
  }

  /**
   * Stop the scraper service
   */
  async stop() {
    if (!this.isRunning) return;

    console.log('🛑 Stopping GMGN Scraper Service...');

    // Clear update interval
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    // Close all monitor pages
    for (const monitor of this.monitors.values()) {
      await monitor.page.close();
    }
    this.monitors.clear();

    // Close browser
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }

    this.isRunning = false;
    console.log('✅ GMGN Scraper Service stopped');
  }

  /**
   * Add a token to monitor
   */
  async addMonitor(tokenMint: string, interval: string = '5m', indicators: string[] = ['RSI', 'EMA_9', 'EMA_20']) {
    if (this.monitors.has(tokenMint)) {
      console.log(`⚠️ Already monitoring ${tokenMint}`);
      return;
    }

    if (!this.browser) {
      throw new Error('Browser not initialized. Call start() first');
    }

    console.log(`📊 Adding monitor for ${tokenMint} (${interval}, ${indicators.join(', ')})`);

    // Open new page
    const page = await this.browser.newPage();
    
    // Set viewport
    await page.setViewport({ width: 1920, height: 1080 });

    // Navigate to GMGN chart
    const url = `https://www.gmgn.cc/kline/sol/${tokenMint}?interval=${interval}&theme=dark`;
    await page.goto(url, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });

    // Wait for chart to load
    await page.waitForSelector('.chart-container, .trading-view, #tv_chart_container', { 
      timeout: 15000 
    }).catch(() => {
      console.log('Chart container not found, continuing anyway...');
    });

    // Wait a bit for chart to fully render
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Try to add indicators via UI (this part depends on GMGN's actual UI)
    for (const indicator of indicators) {
      await this.addIndicatorToChart(page, indicator);
    }

    // Create monitor
    const monitor: ChartMonitor = {
      tokenMint,
      page,
      interval,
      indicators,
      lastUpdate: 0,
      values: {}
    };

    this.monitors.set(tokenMint, monitor);
    console.log(`✅ Monitor added for ${tokenMint}`);

    // Initial update
    await this.updateMonitor(monitor);
  }

  /**
   * Remove a monitor
   */
  async removeMonitor(tokenMint: string) {
    const monitor = this.monitors.get(tokenMint);
    if (!monitor) return;

    await monitor.page.close();
    this.monitors.delete(tokenMint);
    console.log(`✅ Monitor removed for ${tokenMint}`);
  }

  /**
   * Add an indicator to the chart
   */
  private async addIndicatorToChart(page: Page, indicator: string) {
    try {
      // This would need to be adapted based on GMGN's actual UI
      // Example approach:
      
      // 1. Click indicators button
      const indicatorBtn = await page.$('[data-testid="indicators"], .indicators-button, button:has-text("Indicators")');
      if (indicatorBtn) {
        await indicatorBtn.click();
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // 2. Search for indicator
      const searchInput = await page.$('input[placeholder*="Search"], .indicator-search');
      if (searchInput) {
        await searchInput.type(indicator);
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // 3. Click on indicator result
      const indicatorOption = await page.$(`[data-name="${indicator}"], .indicator-item:has-text("${indicator}")`);
      if (indicatorOption) {
        await indicatorOption.click();
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      console.log(`  ➕ Added ${indicator} indicator`);
    } catch (error) {
      console.log(`  ⚠️ Could not add ${indicator} indicator:`, error);
    }
  }

  /**
   * Update all monitors
   */
  private async updateAllMonitors() {
    for (const monitor of this.monitors.values()) {
      await this.updateMonitor(monitor).catch(error => {
        console.error(`Error updating monitor for ${monitor.tokenMint}:`, error);
      });
    }
  }

  /**
   * Update a single monitor
   */
  private async updateMonitor(monitor: ChartMonitor) {
    try {
      // Extract current price
      const price = await this.extractPrice(monitor.page);
      if (price !== null) {
        monitor.values['PRICE'] = price;
      }

      // Extract indicator values
      for (const indicator of monitor.indicators) {
        const value = await this.extractIndicatorValue(monitor.page, indicator);
        if (value !== null) {
          monitor.values[indicator] = value;
          
          // Emit event for each indicator update
          this.emit('indicator_update', {
            tokenMint: monitor.tokenMint,
            timestamp: Date.now(),
            interval: monitor.interval,
            indicator,
            value
          } as IndicatorValue);
        }
      }

      monitor.lastUpdate = Date.now();

      // Emit combined update
      this.emit('monitor_update', {
        tokenMint: monitor.tokenMint,
        interval: monitor.interval,
        values: { ...monitor.values },
        timestamp: monitor.lastUpdate
      });

      console.log(`📈 ${monitor.tokenMint.slice(0, 8)}... Price: $${monitor.values['PRICE']?.toFixed(8) || 'N/A'}, RSI: ${monitor.values['RSI']?.toFixed(2) || 'N/A'}`);

      // Take screenshot in debug mode or if no values extracted
      if (this.debugMode || monitor.values['PRICE'] === null) {
        const screenshotPath = `${this.screenshotDir}/${monitor.tokenMint}_${Date.now()}.png`;
        await monitor.page.screenshot({ path: screenshotPath, fullPage: false });
        console.log(`📸 Screenshot saved: ${screenshotPath}`);
        
        // Emit screenshot event
        this.emit('screenshot', {
          tokenMint: monitor.tokenMint,
          path: screenshotPath,
          timestamp: Date.now()
        });
      }

    } catch (error) {
      console.error(`Error updating monitor for ${monitor.tokenMint}:`, error);
    }
  }

  /**
   * Extract current price from the page
   */
  private async extractPrice(page: Page): Promise<number | null> {
    try {
      // Try multiple selectors that might contain the price
      const selectors = [
        '.price-value',
        '.current-price',
        '[data-testid="price"]',
        '.chart-price',
        '.token-price',
        // GMGN specific selectors (adjust based on actual DOM)
        '.price-display',
        '.main-price',
        'div:has-text("$"):first'
      ];

      for (const selector of selectors) {
        const element = await page.$(selector);
        if (element) {
          const text = await element.evaluate((el: Element) => el.textContent);
          const price = this.parsePrice(text);
          if (price !== null) return price;
        }
      }

      // Try to get from page evaluation
      const price = await page.evaluate(() => {
        // Look for price in various places
        const priceElements = document.querySelectorAll('[class*="price"], [id*="price"]');
        for (const el of priceElements) {
          const text = el.textContent || '';
          if (text.includes('$')) {
            return text;
          }
        }
        return null;
      });

      if (price) {
        return this.parsePrice(price);
      }

    } catch (error) {
      console.error('Error extracting price:', error);
    }
    return null;
  }

  /**
   * Extract indicator value from the page
   */
  private async extractIndicatorValue(page: Page, indicator: string): Promise<number | null> {
    try {
      // Try to find indicator value in the DOM
      const value = await page.evaluate((ind: string) => {
        // Look for indicator values in various places
        // This needs to be customized based on GMGN's actual DOM structure
        
        // Try legend/data panel
        const legendItems = document.querySelectorAll('.legend-item, .indicator-value, [class*="indicator"]');
        for (const item of legendItems) {
          const text = item.textContent || '';
          if (text.includes(ind)) {
            // Extract number from text like "RSI: 45.23" or "RSI(14): 45.23"
            const match = text.match(/[\d.]+/g);
            if (match && match.length > 0) {
              // Return the last number (usually the value)
              return parseFloat(match[match.length - 1]);
            }
          }
        }

        // Try data attributes
        const dataElement = document.querySelector(`[data-indicator="${ind}"], [data-name="${ind}"]`);
        if (dataElement) {
          const value = dataElement.getAttribute('data-value') || dataElement.textContent;
          if (value) {
            const num = parseFloat(value);
            if (!isNaN(num)) return num;
          }
        }

        return null;
      }, indicator);

      return value;

    } catch (error) {
      console.error(`Error extracting ${indicator}:`, error);
    }
    return null;
  }

  /**
   * Parse price from text
   */
  private parsePrice(text: string | null): number | null {
    if (!text) return null;
    
    // Remove $ and other non-numeric characters except . and -
    const cleaned = text.replace(/[^0-9.-]/g, '');
    const price = parseFloat(cleaned);
    
    return isNaN(price) ? null : price;
  }

  /**
   * Get current values for a token
   */
  getValues(tokenMint: string): { [indicator: string]: number | null } | null {
    const monitor = this.monitors.get(tokenMint);
    return monitor ? { ...monitor.values } : null;
  }

  /**
   * Get all active monitors
   */
  getMonitors(): string[] {
    return Array.from(this.monitors.keys());
  }
}

// Export class only, not singleton (to prevent auto-loading)
export { GMGNScraperService };

// Create singleton on demand
let serviceInstance: GMGNScraperService | null = null;

export const getGMGNScraperService = () => {
  if (!serviceInstance) {
    serviceInstance = new GMGNScraperService();
  }
  return serviceInstance;
};
