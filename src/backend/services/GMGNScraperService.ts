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
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log('📊 Chart loaded, checking if indicators are already available...');
    
    // Check if GMGN already shows indicators without needing to add them
    const hasIndicators = await page.evaluate(() => {
      const legendElements = document.querySelectorAll('[class*="legend"], [class*="source"]');
      return legendElements.length > 0;
    });
    
    if (hasIndicators) {
      console.log('✅ Indicators appear to be already available on chart');
    } else {
      console.log('⚠️ No indicators found, attempting to add via UI...');
      // Try to add indicators via UI (this part depends on GMGN's actual UI)
      for (const indicator of indicators) {
        await this.addIndicatorToChart(page, indicator);
      }
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
   * Add an indicator to the chart via TradingView UI
   */
  private async addIndicatorToChart(page: Page, indicator: string) {
    try {
      console.log(`🔧 Adding indicator: ${indicator}`);
      
      // Parse indicator (e.g., "RSI_14", "EMA_9")
      const [indicatorType, period] = indicator.includes('_') 
        ? indicator.split('_') 
        : [indicator, null];
      
      // Click the indicators button - try text first (visible in bot's browser)
      const clicked = await page.evaluate(() => {
        // Method 1: Look for "Indicators" text (visible in puppeteer)
        const allElements = Array.from(document.querySelectorAll('*'));
        const indicatorElement = allElements.find(el => {
          const text = el.textContent?.trim().toLowerCase() || '';
          // Must be the exact text, not containing it (avoid "Indicators and Strategies")
          return (text === 'indicators' || text === 'indicator') && 
                 el.children.length === 0 && // Must be a leaf node (no children)
                 (el as HTMLElement).offsetParent !== null; // Must be visible
        });
        
        if (indicatorElement) {
          // Find clickable parent
          let clickable: any = indicatorElement;
          while (clickable && clickable.tagName !== 'BUTTON' && clickable.tagName !== 'DIV' && clickable !== document.body) {
            clickable = clickable.parentElement;
          }
          
          if (clickable && clickable !== document.body) {
            console.log('🎯 Found "Indicators" text, clicking parent:', clickable.tagName);
            clickable.click();
            return true;
          }
        }
        
        // Method 2: Find the SVG with the fx icon path
        const fxIcon = Array.from(document.querySelectorAll('svg')).find(svg => {
          const path = svg.querySelector('path');
          if (!path) return false;
          
          const d = path.getAttribute('d') || '';
          return d.includes('M7.5 5.5C7.5 4.11929') || 
                 d.includes('M14.2071 14.5001') ||
                 (svg.classList.contains('cursor-pointer') && svg.getAttribute('width') === '20');
        });
        
        if (fxIcon) {
          let clickable = fxIcon.parentElement;
          while (clickable && clickable.tagName !== 'BUTTON' && !clickable.onclick && clickable !== document.body) {
            clickable = clickable.parentElement;
          }
          
          if (clickable && clickable !== document.body) {
            console.log('🎯 Found fx icon, clicking:', clickable.tagName);
            (clickable as HTMLElement).click();
            return true;
          }
        }
        
        console.log('❌ Could not find indicators button (neither text nor icon)');
        return false;
      });
      
      if (!clicked) {
        throw new Error('Could not find indicators fx icon');
      }
      
      console.log('✅ Clicked indicators button');
      
      // Wait for menu to open and search for input field
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Take debug screenshot to see if menu opened
      if (this.debugMode) {
        await page.screenshot({ path: `${this.screenshotDir}/indicator_menu_${Date.now()}.png` });
        console.log('📸 Menu screenshot captured');
      }
      
      // Debug: Log what's actually in the DOM
      const availableElements = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input'));
        const menus = Array.from(document.querySelectorAll('[role="menu"], [class*="menu"]'));
        return {
          inputCount: inputs.length,
          inputs: inputs.map(i => ({
            type: i.type,
            placeholder: i.placeholder,
            class: i.className,
            visible: i.offsetParent !== null
          })),
          menuCount: menus.length,
          menus: menus.map(m => ({
            role: m.getAttribute('role'),
            class: m.className,
            visible: (m as HTMLElement).offsetParent !== null
          }))
        };
      });
      
      console.log('🔍 DOM Debug:', JSON.stringify(availableElements, null, 2));
      
      // Find the search input in TradingView's indicator modal
      // TradingView opens a modal dialog, not a dropdown menu
      const searchSelectors = [
        // TradingView-specific patterns
        '[data-name="indicator-search-input"]',
        '[data-role="search"] input',
        'input[placeholder*="Search"]',
        'input[placeholder*="search"]',
        // Modal/dialog patterns
        '[role="dialog"] input[type="text"]',
        '[class*="dialog"] input',
        '[class*="modal"] input',
        // Generic fallbacks
        'input[type="text"]:visible',
        'input[type="search"]',
        'input:not([type="hidden"])'
      ];
      
      let searchInput = null;
      for (const selector of searchSelectors) {
        try {
          searchInput = await page.waitForSelector(selector, { timeout: 2000, visible: true });
          if (searchInput) {
            console.log(`✅ Found search input with selector: ${selector}`);
            break;
          }
        } catch (e) {
          console.log(`❌ Selector failed: ${selector}`);
          continue;
        }
      }
      
      if (!searchInput) {
        console.error('💥 Could not find search input. Available inputs:', availableElements.inputs);
        throw new Error('Could not find search input in indicators menu');
      }
      
      const indicatorName = indicatorType === 'RSI' ? 'Relative Strength Index' : 
                           indicatorType === 'EMA' ? 'Exponential Moving Average' :
                           indicatorType === 'SMA' ? 'Simple Moving Average' :
                           indicatorType === 'MACD' ? 'MACD' : indicatorType;
      
      await searchInput.type(indicatorName);
      console.log(`⌨️ Typed: ${indicatorName}`);
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Click first result in TradingView's search results
      const resultClicked = await page.evaluate((indName: string) => {
        // TradingView shows results in a list
        const resultSelectors = [
          '[data-role="list-item"]',
          '[class*="item-"]',
          '[class*="listItem"]',
          'div[role="option"]',
          '[class*="search-"] [class*="item"]'
        ];
        
        for (const sel of resultSelectors) {
          const results = document.querySelectorAll(sel);
          for (const result of results) {
            // Check if this result matches our indicator
            const text = result.textContent?.toLowerCase() || '';
            if (text.includes(indName.toLowerCase())) {
              console.log('🎯 Found matching result:', text.substring(0, 50));
              (result as HTMLElement).click();
              return true;
            }
          }
        }
        
        // Fallback: just click first visible result
        const firstResult = Array.from(document.querySelectorAll('[data-role="list-item"], [class*="item-"]'))
          .find(el => (el as HTMLElement).offsetParent !== null);
        if (firstResult) {
          console.log('⚠️ Clicking first available result');
          (firstResult as HTMLElement).click();
          return true;
        }
        
        return false;
      }, indicatorName);
      
      if (!resultClicked) {
        console.warn('⚠️ Could not find search result to click');
      }
      
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // If period specified, configure indicator settings
      if (period) {
        await this.configureIndicatorPeriod(page, indicatorType, period);
      }
      
      console.log(`✅ Indicator added: ${indicator}`);
      
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
   * Configure indicator period/length in settings dialog
   */
  private async configureIndicatorPeriod(page: Page, indicatorType: string, period: string) {
    try {
      // Look for settings/gear icon
      await page.evaluate(() => {
        const settingsBtn = Array.from(document.querySelectorAll('[data-name="legend-settings-action"], .icon-TUJGrV9w'))
          .find(el => el.getAttribute('aria-label')?.includes('Settings'));
        if (settingsBtn) {
          (settingsBtn as HTMLElement).click();
        }
      });
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Find "Length" input for RSI or "Period" for EMA
      const inputSelector = 'input[type="number"], input[inputmode="numeric"]';
      await page.waitForSelector(inputSelector, { timeout: 3000 });
      
      // Clear and set new period
      await page.evaluate((sel: string, val: string) => {
        const inputs = Array.from(document.querySelectorAll(sel)) as HTMLInputElement[];
        const lengthInput = inputs.find(input => 
          input.closest('tr')?.textContent?.includes('Length') ||
          input.closest('tr')?.textContent?.includes('Period')
        );
        if (lengthInput) {
          lengthInput.value = '';
          lengthInput.value = val;
          lengthInput.dispatchEvent(new Event('input', { bubbles: true }));
          lengthInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, inputSelector, period);
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Click OK/Apply button
      await page.evaluate(() => {
        const okBtn = Array.from(document.querySelectorAll('button'))
          .find(el => el.textContent?.includes('OK') || el.textContent?.includes('Apply'));
        if (okBtn) {
          (okBtn as HTMLElement).click();
        }
      });
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      console.log(`✅ Configured ${indicatorType} period: ${period}`);
    } catch (error) {
      console.error(`Error configuring indicator period:`, error);
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
   * Extract current price from TradingView chart
   */
  private async extractPrice(page: Page): Promise<number | null> {
    try {
      // Extract from TradingView's price scale or legend
      const price = await page.evaluate(() => {
        // Method 1: Try chart legend (top-left where O/H/L/C appears)
        const legendValues = document.querySelectorAll('[class*="valueValue"], [class*="value-"], .value');
        for (const el of legendValues) {
          const text = el.textContent || '';
          // Look for "C" (Close) value which is current price
          const parent = el.parentElement?.textContent || '';
          if (parent.includes('C') && !parent.includes('Vol')) {
            return text.trim();
          }
        }
        
        // Method 2: Price scale on right side
        const priceLabels = document.querySelectorAll('[class*="priceLabel"], [class*="price-axis"]');
        for (const el of priceLabels) {
          const text = el.textContent || '';
          if (text.match(/^[0-9.]+$/)) {
            return text;
          }
        }
        
        // Method 3: GMGN-specific header price
        const headerPrice = document.querySelector('.token-price, .price-display, [class*="currentPrice"]');
        if (headerPrice?.textContent) {
          return headerPrice.textContent.replace(/[^0-9.]/g, '');
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
   * Extract indicator value from TradingView chart legend
   */
  private async extractIndicatorValue(page: Page, indicator: string): Promise<number | null> {
    try {
      // Parse indicator name (e.g., "RSI_14" -> look for "RSI")
      const indicatorType = indicator.split('_')[0];
      
      const value = await page.evaluate((indType: string) => {
        // TradingView shows indicators in legend items
        const legendSources = document.querySelectorAll('[class*="legendMainSourceWrapper"], [class*="sourcesWrapper"]');
        
        for (const source of legendSources) {
          const text = source.textContent || '';
          
          // Look for indicator by name
          if (text.includes(indType) || 
              text.includes('RSI') && indType === 'RSI' ||
              text.includes('EMA') && indType === 'EMA' ||
              text.includes('SMA') && indType === 'SMA' ||
              text.includes('MACD') && indType === 'MACD') {
            
            // Extract the numeric value (usually after indicator name)
            // Format examples: "RSI 14: 45.32", "EMA(9): 0.00012"
            const matches = text.match(/([0-9]+\.?[0-9]*)/);
            if (matches && matches[1]) {
              const val = parseFloat(matches[1]);
              // Sanity check: RSI should be 0-100, prices should be reasonable
              if (indType === 'RSI' && (val < 0 || val > 100)) return null;
              return val.toString();
            }
          }
        }
        
        // Fallback: Try to find in any element containing indicator name
        const allElements = document.querySelectorAll('*');
        for (const el of allElements) {
          if (el.children.length > 0) continue; // Skip parent elements
          const text = el.textContent || '';
          if (text.includes(indType) && text.length < 100) {
            const matches = text.match(/[0-9]+\.[0-9]+/);
            if (matches) return matches[0];
          }
        }

        return null;
      }, indicatorType);

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
