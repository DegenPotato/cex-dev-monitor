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
  frame?: any; // TradingView iframe if chart is embedded
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
  private debugMode: boolean = true;  // Enable debug mode for screenshots
  private screenshotDir: string = './screenshots';  // Back to what was working
  private screenshotCounter: number = 0;

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
      console.log(`✅ Created screenshots directory: ${this.screenshotDir}`);
    } else {
      console.log(`✅ Screenshots directory exists: ${this.screenshotDir}`);
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
  async addMonitor(tokenMint: string, interval: string = '5m', indicators: string[] = ['RSI_14', 'RSI_2', 'EMA_21', 'EMA_50', 'EMA_100', 'EMA_200']) {
    // Validate token mint address
    if (!tokenMint || tokenMint.length < 32 || tokenMint.length > 44) {
      console.error(`❌ Invalid token mint address: ${tokenMint} (length: ${tokenMint.length})`);
      throw new Error(`Invalid token mint address format. Expected 32-44 characters, got ${tokenMint.length}`);
    }
    
    if (this.monitors.has(tokenMint)) {
      console.log(`⚠️ Already monitoring ${tokenMint}`);
      return;
    }

    if (!this.browser) {
      throw new Error('Browser not initialized. Call start() first');
    }

    console.log(`📊 Adding monitor for ${tokenMint} (${tokenMint.length} chars)`);
    
    // Create new page for this monitor
    const page = await this.browser.newPage();
    
    // Set viewport
    await page.setViewport({ width: 1920, height: 1080 });

    // Navigate to GMGN chart
    const url = `https://www.gmgn.cc/kline/sol/${tokenMint}`;
    console.log(`🌐 Navigating to: ${url}`);
    
    try {
      await page.goto(url, { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });
      console.log(`📊 Loaded GMGN page for ${tokenMint}`);
    } catch (error: any) {
      console.error(`❌ Navigation failed:`, error.message);
      
      // If DNS error, could be server IP blocked or DNS issue
      if (error.message.includes('ERR_NAME_NOT_RESOLVED')) {
        console.log('💡 Possible causes:');
        console.log('   1. Server IP might be blocked by gmgn.cc');
        console.log('   2. DNS resolver issues on server');
        console.log('   3. Try using a proxy or different server');
      }
      
      await page.close();
      throw error;
    }

    // Close any popups first
    await page.evaluate(() => {
      // Try to close GMGN popup/modal
      const closeButtons = document.querySelectorAll('button, [role="button"], .close, [class*="close"]');
      for (const btn of closeButtons) {
        const text = btn.textContent?.toLowerCase() || '';
        if (text.includes('close') || text.includes('x') || text === '×') {
          (btn as HTMLElement).click();
        }
      }
    });
    
    // Wait for chart container - be more lenient with selectors
    console.log('⏳ Waiting for chart to load...');
    try {
      await page.waitForSelector('iframe, canvas, [class*="chart"], [class*="tradingview"]', { timeout: 15000 });
      console.log('✅ Chart area detected');
    } catch (waitError) {
      console.log('⚠️ Chart wait timeout, checking what\'s on the page...');
      
      // Debug what's actually on the page
      const pageContent = await page.evaluate(() => {
        return {
          iframes: document.querySelectorAll('iframe').length,
          canvas: document.querySelectorAll('canvas').length,
          charts: document.querySelectorAll('[class*="chart"]').length,
          title: document.title,
          bodyText: document.body?.innerText?.substring(0, 200)
        };
      });
      
      console.log('📄 Page content:', pageContent);
      
      // Continue anyway - maybe the chart loads dynamically
      console.log('⏩ Continuing despite timeout...');
    }
    
    // Check if TradingView is embedded
    console.log('📊 Checking for TradingView iframe...');
    const frames = page.frames();
    console.log(`🔍 Found ${frames.length} frames on page`);
    
    let tvFrame = null;
    for (const frame of frames) {
      const frameUrl = frame.url();
      if (frameUrl.includes('tradingview') || frameUrl.includes('charting_library') || frameUrl.startsWith('blob:')) {
        console.log(`✅ Found TradingView iframe: ${frameUrl.substring(0, 50)}...`);
        tvFrame = frame;
        break;
      }
    }

    // Wait for TradingView to fully load within iframe
    if (tvFrame) {
      console.log('📊 Chart loaded, checking if indicators are already available...');
      
      // Wait a bit for TradingView to fully initialize
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Check if indicators already exist
      const hasIndicators = await tvFrame.evaluate(() => {
        const legends = document.querySelectorAll('[class*="legend"], [class*="source"]');
        for (const legend of legends) {
          const text = legend.textContent || '';
          if (text.includes('RSI') || text.includes('EMA')) {
            return true;
          }
        }
        return false;
      });
      
      if (!hasIndicators) {
        console.log('⚠️ No indicators found, adding all indicators first with default values...');
        
        // STEP 1: Add all indicators with default values
        console.log('📊 Step 1: Adding all indicators in one session...');
        await this.addAllIndicators(tvFrame);
        
        console.log('✅ All indicators added with default values');
        
        // STEP 2: Configure each indicator to correct period
        console.log('📊 Step 2: Configuring indicator periods...');
        await new Promise(resolve => setTimeout(resolve, 5000)); // Let everything settle
        
        // Take screenshot before configuration
        await this.takeDebugScreenshot('before_configuration');
        
        // Now configure each indicator
        const configurations = [
          { type: 'RSI', index: 0, period: '14' }, // First RSI stays at 14
          { type: 'RSI', index: 1, period: '2' },  // Second RSI to 2
          { type: 'EMA', index: 0, period: '21' },
          { type: 'EMA', index: 1, period: '50' },
          { type: 'EMA', index: 2, period: '100' },
          { type: 'EMA', index: 3, period: '200' },
        ];
        
        for (const config of configurations) {
          console.log(`  Configuring ${config.type} #${config.index + 1} to period ${config.period}`);
          await this.configureIndicatorByIndex(tvFrame, config.type, config.index, config.period);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        console.log('✅ All indicators configured');
        await this.takeDebugScreenshot('after_configuration');
      }
    }

    // Create monitor - store both page and frame
    const monitor: ChartMonitor = {
      tokenMint,
      page,
      interval,
      indicators,
      lastUpdate: 0,
      values: {},
      frame: tvFrame // Store the frame for later use
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
   * Take a debug screenshot if debug mode is enabled
   */
  private async takeDebugScreenshot(name: string) {
    if (!this.debugMode || this.monitors.size === 0) return;
    
    try {
      const firstMonitor = Array.from(this.monitors.values())[0];
      if (firstMonitor?.page) {
        const filename = `${this.screenshotDir}/${name}_${this.screenshotCounter++}_${Date.now()}.png`;
        await firstMonitor.page.screenshot({ path: filename });
        console.log(`📸 Screenshot saved: ${filename}`);
      }
    } catch (error) {
      console.log('⚠️ Failed to take screenshot:', error);
    }
  }

  /**
   * Add all indicators in one session - simpler approach
   */
  private async addAllIndicators(pageOrFrame: any) {
    try {
      console.log('📊 Starting indicator addition process...');
      
      // Take initial screenshot
      await this.takeDebugScreenshot('0_initial_chart');
      
      // List of indicators to add
      const indicators = [
        'RSI', 'RSI',  // 2x RSI
        'EMA', 'EMA', 'EMA', 'EMA'  // 4x EMA
      ];
      
      const results = {
        attempted: 0,
        succeeded: 0,
        failed: 0
      };
      
      for (let i = 0; i < indicators.length; i++) {
        const indicatorType = indicators[i];
        console.log(`\n${'='.repeat(50)}`);
        console.log(`📍 INDICATOR ${i + 1}/${indicators.length}: ${indicatorType}`);
        console.log(`${'='.repeat(50)}`);
        
        results.attempted++;
        
        // For EACH indicator, open menu fresh
        const success = await this.addSingleIndicator(pageOrFrame, indicatorType);
        
        if (success) {
          results.succeeded++;
          console.log(`✅ Successfully added ${indicatorType} #${i + 1}`);
        } else {
          results.failed++;
          console.log(`❌ Failed to add ${indicatorType} #${i + 1}`);
        }
        
        // Wait between additions
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Take screenshot after each addition
        await this.takeDebugScreenshot(`${i + 1}_after_${indicatorType}`);
        
        // Log current status
        console.log(`📊 Progress: ${results.succeeded}/${indicators.length} added successfully`);
      }
      
      // Close the indicators menu if it's still open
      await pageOrFrame.evaluate(() => {
        // Press ESC to close menu
        const escEvent = new KeyboardEvent('keydown', {
          key: 'Escape',
          code: 'Escape',
          keyCode: 27,
          bubbles: true
        });
        document.dispatchEvent(escEvent);
      });
      
      // Final summary
      console.log(`\n${'='.repeat(50)}`);
      console.log(`📊 FINAL INDICATOR ADDITION RESULTS:`);
      console.log(`   ✅ Succeeded: ${results.succeeded}`);
      console.log(`   ❌ Failed: ${results.failed}`);
      console.log(`   📈 Total: ${results.attempted}`);
      console.log(`${'='.repeat(50)}`);
      
      // Check what indicators are actually visible on the chart
      const visibleIndicators = await pageOrFrame.evaluate(() => {
        // Look specifically for legend items that are indicator titles
        const legends = Array.from(document.querySelectorAll('[class*="legendMainSourceWrapper"], [class*="sourcesWrapper"], [class*="legendSource"]'));
        const indicators: { type: string, period: string }[] = [];
        
        for (const legend of legends) {
          const text = legend.textContent || '';
          
          // Look for RSI indicators (format: "RSI 14" or just "RSI")
          if (text.includes('RSI') && !text.includes('RSI(')) {
            // Extract the period if visible
            const match = text.match(/RSI\s*(\d+)/);
            if (match) {
              indicators.push({ type: 'RSI', period: match[1] });
            } else {
              indicators.push({ type: 'RSI', period: '?' });
            }
          }
          
          // Look for EMA indicators (format: "EMA 9" or "EMA(9)")
          if (text.includes('EMA') && !indicators.some(i => i.type === 'EMA' && text.includes(i.period))) {
            const match = text.match(/EMA\s*\(?\s*(\d+)/);
            if (match) {
              indicators.push({ type: 'EMA', period: match[1] });
            } else if (text.includes('EMA')) {
              indicators.push({ type: 'EMA', period: '?' });
            }
          }
        }
        
        // Format for display
        return indicators.map(i => `${i.type}(${i.period})`);
      });
      
      console.log(`\n📊 INDICATORS VISIBLE ON CHART:`);
      if (visibleIndicators.length > 0) {
        visibleIndicators.forEach((ind: string) => console.log(`   ✅ ${ind}`));
      } else {
        console.log(`   ⚠️ No indicators detected on chart`);
      }
      console.log(`${'='.repeat(50)}`);
      
    } catch (error) {
      console.error('Error adding indicators:', error);
      throw error;
    }
  }
  
  /**
   * Add a single indicator - open menu, add it, close menu
   */
  private async addSingleIndicator(pageOrFrame: any, indicatorType: string): Promise<boolean> {
    try {
      // ALWAYS close menu first to ensure clean state
      await pageOrFrame.evaluate(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
      });
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Open indicators menu fresh
      const menuOpened = await this.openIndicatorsMenu(pageOrFrame);
      if (!menuOpened) {
        console.log(`⚠️ Could not open menu for ${indicatorType}`);
        return false;
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Find search input
      const searchInput = await this.findSearchInput(pageOrFrame);
      if (!searchInput) {
        console.log(`⚠️ No search input for ${indicatorType}`);
        // Close menu and return
        await pageOrFrame.evaluate(() => {
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
        });
        return false;
      }
      
      // Type indicator name
      const indicatorName = indicatorType === 'RSI' ? 'Relative Strength Index' : 'Moving Average Exponential';
      await searchInput.type(indicatorName);
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Click result
      const clicked = await this.clickSearchResult(pageOrFrame, indicatorName);
      
      // CRITICAL: Always close menu after adding (success or fail)
      // This ensures next indicator gets a fresh menu state
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Method 1: Try to click close button if exists
      const closedViaButton = await pageOrFrame.evaluate(() => {
        const closeButtons = document.querySelectorAll('[aria-label*="Close"], [title*="Close"], button[class*="close"], .close-button');
        for (const btn of closeButtons) {
          if ((btn as HTMLElement).offsetParent !== null) {
            (btn as HTMLElement).click();
            return true;
          }
        }
        return false;
      });
      
      if (!closedViaButton) {
        // Method 2: Click the indicators button again to toggle menu closed
        const toggleClosed = await pageOrFrame.evaluate(() => {
          const indicatorButtons = Array.from(document.querySelectorAll('button, [role="button"]'));
          for (const btn of indicatorButtons) {
            const text = btn.textContent?.toLowerCase() || '';
            const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
            if (text.includes('indicators') || ariaLabel.includes('indicators')) {
              (btn as HTMLElement).click();
              return true;
            }
          }
          return false;
        });
        
        if (!toggleClosed) {
          // Method 3: Fallback to ESC key
          await pageOrFrame.evaluate(() => {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
            document.body.click();
          });
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      if (clicked) {
        console.log(`✅ Added ${indicatorType}`);
        return true;
      } else {
        console.log(`⚠️ Could not add ${indicatorType}`);
        return false;
      }
      
    } catch (error) {
      console.log(`Error adding ${indicatorType}:`, error);
      return false;
    }
  }
  
  /**
   * Open the indicators menu
   */
  private async openIndicatorsMenu(pageOrFrame: any): Promise<boolean> {
    try {
      const debugInfo = await pageOrFrame.evaluate(() => {
        return {
          svgCount: document.querySelectorAll('svg').length,
          buttonCount: document.querySelectorAll('button').length,
          elementsWithIndicatorsText: Array.from(document.querySelectorAll('*'))
            .filter(el => el.textContent?.toLowerCase().includes('indicator'))
            .map(el => ({
              tag: el.tagName,
              text: el.textContent?.substring(0, 50),
              visible: (el as HTMLElement).offsetParent !== null
            })).slice(0, 5)
        };
      });
      
      console.log('🔍 Page debug:', JSON.stringify(debugInfo, null, 2));
      
      // Click the indicators button - try text first (visible in bot's browser)
      const clicked = await pageOrFrame.evaluate(() => {
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
            (clickable as HTMLElement).click();
            return { method: 'text', tag: clickable.tagName };
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
            (clickable as HTMLElement).click();
            return { method: 'svg', tag: clickable.tagName };
          }
        }
        
        return null;
      });
      
      if (clicked) {
        console.log(`✅ Opened indicators menu`);
        return true;
      }
      
      console.error('❌ Could not find indicators button. Page has:', debugInfo);
      return false;
    } catch (error) {
      console.error('Error opening indicators menu:', error);
      return false;
    }
  }
  
  /**
   * Find the search input in the indicators menu
   */
  private async findSearchInput(pageOrFrame: any): Promise<any> {
    try {
      // Wait a bit for the menu to fully render
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Debug: Log what's actually in the DOM
      const availableElements = await pageOrFrame.evaluate(() => {
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
      
      console.log('📍 DOM Debug:', availableElements);
      
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
          searchInput = await pageOrFrame.waitForSelector(selector, { timeout: 2000, visible: true });
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
      
      return searchInput;
      
    } catch (error) {
      console.error('Error finding search input:', error);
      return null;
    }
  }
  
  /**
   * Click the search result for an indicator
   */
  private async clickSearchResult(pageOrFrame: any, indicatorName: string): Promise<boolean> {
    try {
      const resultClicked = await pageOrFrame.evaluate((indName: string) => {
        // TradingView shows results in a list
        const resultSelectors = [
          '[data-role="list-item"]',
          '[class*="item-"]',
          '[class*="listItem"]',
          'div[role="option"]',
          '[class*="search-"] [class*="item"]',
          '.tv-insert-study-item'
        ];
        
        for (const sel of resultSelectors) {
          const results = document.querySelectorAll(sel);
          for (const result of results) {
            // Check if this result matches our indicator
            const text = result.textContent?.toLowerCase() || '';
            if (text.includes(indName.toLowerCase()) || text.includes('moving average')) {
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
      
      return resultClicked;
    } catch (error) {
      console.error('Error clicking search result:', error);
      return false;
    }
  }

  /**
   * Configure a specific indicator by its index in the legend
   */
  private async configureIndicatorByIndex(pageOrFrame: any, indicatorType: string, index: number, period: string) {
    try {
      console.log(`🔧 Configuring ${indicatorType} #${index + 1} to period ${period}`);
      
      // Step 1: Click the indicator text to reveal buttons
      const indicatorClicked = await pageOrFrame.evaluate((indType: string, idx: number) => {
        // Find all legends with this indicator type
        const legends = Array.from(document.querySelectorAll('[class*="legend"], [class*="source"], [class*="title"]'));
        let matchCount = 0;
        
        for (const legend of legends) {
          const text = legend.textContent?.toLowerCase() || '';
          
          // Check if this legend contains our indicator type
          if ((indType.toLowerCase() === 'ema' && text.includes('ema')) ||
              (indType.toLowerCase() === 'rsi' && text.includes('rsi'))) {
            
            if (matchCount === idx) {
              // This is the indicator we want to configure
              console.log(`Found ${indType} #${idx + 1}: ${text.substring(0, 50)}`);
              
              // Click the indicator text to reveal buttons
              (legend as HTMLElement).click();
              return true;
            }
            matchCount++;
          }
        }
        return false;
      }, indicatorType, index);
      
      if (!indicatorClicked) {
        console.log(`⚠️ Could not find ${indicatorType} #${index + 1} in legend`);
        return false;
      }
      
      // Step 2: Wait for buttons to appear
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Step 3: Click the settings button (3rd button or with aria-label="Settings")
      const settingsOpened = await pageOrFrame.evaluate(() => {
        // Look for the settings button that should now be visible
        const settingsButtons = Array.from(document.querySelectorAll('[aria-label="Settings"], [data-name="legend-settings-action"], button[class*="button-l31H9iuA"]'));
        
        for (const btn of settingsButtons) {
          // Check if it's visible and is the settings button
          if ((btn as HTMLElement).offsetParent !== null && 
              (btn.getAttribute('aria-label') === 'Settings' || 
               btn.getAttribute('data-name') === 'legend-settings-action')) {
            (btn as HTMLElement).click();
            return 'settings_clicked';
          }
        }
        
        // Fallback: Try right-clicking if settings button not found
        const legends = Array.from(document.querySelectorAll('[class*="legend"]:hover, [class*="source"]:hover'));
        if (legends.length > 0) {
          const rightClickEvent = new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            view: window,
            button: 2,
            buttons: 2
          });
          legends[0].dispatchEvent(rightClickEvent);
          return 'rightclick_attempted';
        }
        
        return false;
      });
      
      if (settingsOpened) {
        console.log(`✅ Settings menu opened via: ${settingsOpened}`);
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Take screenshot of settings dialog
        await this.takeDebugScreenshot(`settings_${indicatorType}_${index}`);
        
        // Now look for the inputs tab and period field
        await this.configureIndicatorSettings(pageOrFrame, indicatorType, period);
      } else {
        console.warn(`⚠️ Could not open settings for ${indicatorType} #${index + 1}`);
      }
    } catch (error) {
      console.error(`Error configuring ${indicatorType} #${index + 1}:`, error);
    }
  }

  /**
   * Configure indicator settings after opening the settings dialog
   */
  private async configureIndicatorSettings(pageOrFrame: any, indicatorType: string, period: string) {
    try {
      console.log(`🔍 Looking for settings dialog or input fields...`);
      
      // First check what's available in the DOM
      const configElements = await pageOrFrame.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input[type="number"], input[inputmode="numeric"], input[type="text"]'));
        const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [class*="dialog"], [class*="modal"]'));
        const buttons = Array.from(document.querySelectorAll('button'));
        
        return {
          inputCount: inputs.length,
          inputs: inputs.map(i => ({
            type: i.getAttribute('type'),
            value: (i as HTMLInputElement).value,
            placeholder: i.getAttribute('placeholder'),
            visible: (i as HTMLElement).offsetParent !== null,
            parentText: i.parentElement?.textContent?.substring(0, 50)
          })),
          dialogCount: dialogs.length,
          dialogs: dialogs.map(d => ({
            visible: (d as HTMLElement).offsetParent !== null,
            text: d.textContent?.substring(0, 100)
          })),
          buttons: buttons.filter(b => 
            b.textContent?.match(/OK|Apply|Save|Confirm/i)
          ).map(b => b.textContent)
        };
      });
      
      console.log('📋 Config elements found:', JSON.stringify(configElements, null, 2));
      
      // Try different approaches to find and set the period input
      const inputFound = await pageOrFrame.evaluate((targetPeriod: string) => {
        // Method 1: Look for visible number inputs
        const numberInputs = Array.from(document.querySelectorAll('input[type="number"], input[inputmode="numeric"]')) as HTMLInputElement[];
        for (const input of numberInputs) {
          if ((input as HTMLElement).offsetParent !== null) {
            // Check if this looks like a period/length input
            const parentText = input.parentElement?.textContent?.toLowerCase() || '';
            const labelText = input.getAttribute('aria-label')?.toLowerCase() || '';
            
            if (parentText.includes('period') || parentText.includes('length') || 
                labelText.includes('period') || labelText.includes('length') ||
                input.value === '9' || input.value === '14' || input.value === '20') {
              
              console.log(`Found potential period input with value: ${input.value}`);
              input.value = targetPeriod;
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
              
              // Also try setting via React if needed
              const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
              if (nativeInputValueSetter) {
                nativeInputValueSetter.call(input, targetPeriod);
                input.dispatchEvent(new Event('input', { bubbles: true }));
              }
              
              return true;
            }
          }
        }
        
        // Method 2: Look for any visible text input that might contain the period
        const textInputs = Array.from(document.querySelectorAll('input[type="text"]')) as HTMLInputElement[];
        for (const input of textInputs) {
          if ((input as HTMLElement).offsetParent !== null && 
              (input.value === '9' || input.value === '14' || input.value === '20')) {
            console.log(`Found text input with period value: ${input.value}`);
            input.value = targetPeriod;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
        }
        
        return false;
      }, period);
      
      if (inputFound) {
        console.log(`✅ Set period to ${period}`);
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Click OK/Apply button
        await pageOrFrame.evaluate(() => {
          const okBtn = Array.from(document.querySelectorAll('button'))
            .find(el => {
              const text = el.textContent?.toLowerCase() || '';
              return text.includes('ok') || text.includes('apply') || text.includes('save');
            });
          if (okBtn) {
            (okBtn as HTMLElement).click();
            return true;
          }
          
          // Alternative: Press Enter key
          const activeElement = document.activeElement as HTMLElement;
          if (activeElement) {
            const enterEvent = new KeyboardEvent('keydown', {
              key: 'Enter',
              code: 'Enter',
              keyCode: 13,
              bubbles: true
            });
            activeElement.dispatchEvent(enterEvent);
          }
          return false;
        });
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log(`✅ Configured ${indicatorType} period: ${period}`);
      } else {
        console.warn(`⚠️ Could not find period input field for ${indicatorType}`);
      }
      
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
