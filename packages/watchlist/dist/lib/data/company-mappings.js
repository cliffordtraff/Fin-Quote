// Company mappings for news article matching
// This database helps match news articles to ticker symbols
export const companyMappings = {
    // Tech Giants
    AAPL: {
        symbol: 'AAPL',
        primary: 'Apple Inc',
        aliases: ['Apple', 'Apple Computer', 'Apple Inc.'],
        executives: ['Tim Cook', 'Craig Federighi', 'Johny Srouji', 'Jeff Williams'],
        products: ['iPhone', 'iPad', 'Mac', 'MacBook', 'AirPods', 'Apple Watch', 'Vision Pro', 'iOS', 'macOS', 'iPadOS'],
        contextPositive: ['Cupertino', 'technology', 'smartphone', 'tablet', 'App Store', 'Silicon Valley'],
        contextNegative: ['fruit', 'orchard', 'pie', 'juice', 'cider', 'tree']
    },
    MSFT: {
        symbol: 'MSFT',
        primary: 'Microsoft Corporation',
        aliases: ['Microsoft', 'Microsoft Corp', 'Microsoft Corp.'],
        executives: ['Satya Nadella', 'Amy Hood', 'Brad Smith', 'Scott Guthrie'],
        products: ['Windows', 'Office 365', 'Microsoft Office', 'Azure', 'Xbox', 'Surface', 'Microsoft Teams', 'OneDrive', 'GitHub', 'LinkedIn', 'Copilot'],
        contextPositive: ['Redmond', 'cloud computing', 'enterprise software'],
        contextNegative: ['office space', 'office building', 'outlook for', 'economic outlook', 'market outlook', 'supply outlook', 'ceo to run', 'family office']
    },
    GOOGL: {
        symbol: 'GOOGL',
        primary: 'Alphabet Inc',
        aliases: ['Google', 'Alphabet', 'Alphabet Inc.'],
        executives: ['Sundar Pichai', 'Ruth Porat', 'Philipp Schindler', 'Thomas Kurian'],
        products: ['Search', 'YouTube', 'Android', 'Chrome', 'Gmail', 'Maps', 'Cloud Platform', 'Pixel', 'Waymo'],
        contextPositive: ['Mountain View', 'search engine', 'advertising', 'AI', 'DeepMind'],
        contextNegative: ['alphabet', 'letters']
    },
    AMZN: {
        symbol: 'AMZN',
        primary: 'Amazon.com Inc',
        aliases: ['Amazon', 'Amazon.com'],
        executives: ['Andy Jassy', 'Brian Olsavsky', 'Dave Clark', 'Adam Selipsky'],
        products: ['AWS', 'Prime', 'Alexa', 'Echo', 'Kindle', 'Fire TV', 'Whole Foods', 'Ring'],
        contextPositive: ['Seattle', 'e-commerce', 'cloud computing', 'retail', 'logistics'],
        contextNegative: ['rainforest', 'river', 'jungle', 'Brazil']
    },
    META: {
        symbol: 'META',
        primary: 'Meta Platforms Inc',
        aliases: ['Meta', 'Facebook', 'Meta Platforms'],
        executives: ['Mark Zuckerberg', 'Sheryl Sandberg', 'Susan Li', 'Chris Cox'],
        products: ['Facebook', 'Instagram', 'WhatsApp', 'Messenger', 'Oculus', 'Quest', 'Threads'],
        contextPositive: ['Menlo Park', 'social media', 'metaverse', 'VR', 'social network'],
        contextNegative: ['metadata', 'metaphor', 'metamorphosis']
    },
    NVDA: {
        symbol: 'NVDA',
        primary: 'NVIDIA Corporation',
        aliases: ['NVIDIA', 'Nvidia', 'NVDA'],
        executives: ['Jensen Huang', 'Colette Kress', 'Jay Puri'],
        products: ['GeForce', 'RTX', 'CUDA', 'Tesla', 'A100', 'H100', 'DGX', 'Quadro'],
        contextPositive: ['Santa Clara', 'GPU', 'graphics', 'AI chips', 'data center', 'gaming'],
        contextNegative: []
    },
    TSLA: {
        symbol: 'TSLA',
        primary: 'Tesla Inc',
        aliases: ['Tesla', 'Tesla Motors'],
        executives: ['Elon Musk', 'Zachary Kirkhorn', 'Andrew Baglino', 'Tom Zhu'],
        products: ['Model S', 'Model 3', 'Model X', 'Model Y', 'Cybertruck', 'Powerwall', 'Solar Roof', 'Supercharger'],
        contextPositive: ['Austin', 'Fremont', 'electric vehicle', 'EV', 'battery', 'autonomous'],
        contextNegative: ['Nikola Tesla', 'tesla coil', 'unit']
    },
    // Financial
    JPM: {
        symbol: 'JPM',
        primary: 'JPMorgan Chase & Co',
        aliases: ['JPMorgan', 'JP Morgan', 'Chase', 'JPMorgan Chase'],
        executives: ['Jamie Dimon', 'Daniel Pinto', 'Mary Erdoes', 'Marianne Lake'],
        products: ['Chase', 'J.P. Morgan', 'Asset Management', 'Investment Banking'],
        contextPositive: ['banking', 'finance', 'Wall Street', 'investment'],
        contextNegative: []
    },
    BAC: {
        symbol: 'BAC',
        primary: 'Bank of America Corporation',
        aliases: ['Bank of America', 'BofA', 'BoA'],
        executives: ['Brian Moynihan', 'Alastair Borthwick', 'Paul Donofrio'],
        products: ['Merrill Lynch', 'Merrill Edge', 'Global Banking', 'Wealth Management'],
        contextPositive: ['Charlotte', 'banking', 'financial services'],
        contextNegative: []
    },
    GS: {
        symbol: 'GS',
        primary: 'Goldman Sachs Group Inc',
        aliases: ['Goldman Sachs', 'Goldman'],
        executives: ['David Solomon', 'John Waldron', 'Denis Coleman'],
        products: ['Marcus', 'Investment Banking', 'Asset Management', 'Trading'],
        contextPositive: ['Wall Street', 'investment bank', 'trading'],
        contextNegative: []
    },
    WFC: {
        symbol: 'WFC',
        primary: 'Wells Fargo & Company',
        aliases: ['Wells Fargo', 'Wells'],
        executives: ['Charles Scharf', 'Mike Santomassimo', 'Scott Powell'],
        products: ['Banking', 'Mortgage', 'Investment', 'Insurance'],
        contextPositive: ['San Francisco', 'banking', 'financial'],
        contextNegative: ['water well', 'well']
    },
    // Healthcare
    JNJ: {
        symbol: 'JNJ',
        primary: 'Johnson & Johnson',
        aliases: ['J&J', 'Johnson and Johnson'],
        executives: ['Joaquin Duato', 'Joseph Wolk', 'Ashley McEvoy'],
        products: ['Tylenol', 'Band-Aid', 'Neutrogena', 'Listerine', 'Acuvue', 'Medical Devices'],
        contextPositive: ['New Brunswick', 'pharmaceutical', 'healthcare', 'medical'],
        contextNegative: []
    },
    PFE: {
        symbol: 'PFE',
        primary: 'Pfizer Inc',
        aliases: ['Pfizer'],
        executives: ['Albert Bourla', 'Frank D\'Amelio', 'Mikael Dolsten'],
        products: ['Comirnaty', 'Paxlovid', 'Prevnar', 'Eliquis', 'Xeljanz', 'Viagra'],
        contextPositive: ['pharmaceutical', 'vaccine', 'drug', 'medicine'],
        contextNegative: []
    },
    UNH: {
        symbol: 'UNH',
        primary: 'UnitedHealth Group Inc',
        aliases: ['UnitedHealth', 'United Health'],
        executives: ['Andrew Witty', 'John Rex', 'Brian Thompson'],
        products: ['UnitedHealthcare', 'Optum', 'OptumRx', 'OptumHealth'],
        contextPositive: ['health insurance', 'healthcare', 'managed care'],
        contextNegative: []
    },
    // Retail
    WMT: {
        symbol: 'WMT',
        primary: 'Walmart Inc',
        aliases: ['Walmart', 'Wal-Mart'],
        executives: ['Doug McMillon', 'John Furner', 'Judith McKenna'],
        products: ['Sam\'s Club', 'Walmart+', 'Great Value', 'Walmart.com'],
        contextPositive: ['Bentonville', 'retail', 'supermarket', 'discount'],
        contextNegative: []
    },
    HD: {
        symbol: 'HD',
        primary: 'Home Depot Inc',
        aliases: ['Home Depot', 'The Home Depot'],
        executives: ['Ted Decker', 'Richard McPhail', 'Ann-Marie Campbell'],
        products: ['Home Improvement', 'Tools', 'Building Materials'],
        contextPositive: ['Atlanta', 'retail', 'hardware', 'construction'],
        contextNegative: []
    },
    // Energy
    XOM: {
        symbol: 'XOM',
        primary: 'Exxon Mobil Corporation',
        aliases: ['ExxonMobil', 'Exxon', 'Mobil'],
        executives: ['Darren Woods', 'Kathy Mikells', 'Neil Chapman'],
        products: ['Oil', 'Gas', 'Chemicals', 'Lubricants'],
        contextPositive: ['Irving', 'energy', 'petroleum', 'oil and gas'],
        contextNegative: []
    },
    CVX: {
        symbol: 'CVX',
        primary: 'Chevron Corporation',
        aliases: ['Chevron'],
        executives: ['Mike Wirth', 'Pierre Breber', 'Mark Nelson'],
        products: ['Oil', 'Gas', 'Texaco', 'Caltex'],
        contextPositive: ['San Ramon', 'energy', 'petroleum', 'oil'],
        contextNegative: []
    },
    // Automotive (non-Tesla)
    F: {
        symbol: 'F',
        primary: 'Ford Motor Company',
        aliases: ['Ford', 'Ford Motor'],
        executives: ['Jim Farley', 'John Lawler', 'Kumar Galhotra'],
        products: ['F-150', 'Mustang', 'Explorer', 'Bronco', 'Lightning', 'Mach-E'],
        contextPositive: ['Dearborn', 'automotive', 'trucks', 'vehicles'],
        contextNegative: ['ford river', 'crossing', 'Gerald Ford', 'Harrison Ford']
    },
    GM: {
        symbol: 'GM',
        primary: 'General Motors Company',
        aliases: ['General Motors', 'GM'],
        executives: ['Mary Barra', 'Paul Jacobson', 'Mark Reuss'],
        products: ['Chevrolet', 'GMC', 'Cadillac', 'Buick', 'Cruise', 'Ultium'],
        contextPositive: ['Detroit', 'automotive', 'vehicles', 'electric'],
        contextNegative: ['general manager', 'GM foods']
    },
    // Communications
    VZ: {
        symbol: 'VZ',
        primary: 'Verizon Communications Inc',
        aliases: ['Verizon'],
        executives: ['Hans Vestberg', 'Matt Ellis', 'Kyle Malady'],
        products: ['Wireless', '5G', 'Fios', 'Business Services'],
        contextPositive: ['telecommunications', 'wireless', 'mobile', 'network'],
        contextNegative: []
    },
    T: {
        symbol: 'T',
        primary: 'AT&T Inc',
        aliases: ['AT&T', 'ATT'],
        executives: ['John Stankey', 'Pascal Desroches', 'Jeff McElfresh'],
        products: ['Wireless', '5G', 'Fiber', 'HBO Max', 'DirecTV'],
        contextPositive: ['Dallas', 'telecommunications', 'wireless', 'mobile'],
        contextNegative: ['at', 't-shirt']
    },
    // Semiconductors
    AMD: {
        symbol: 'AMD',
        primary: 'Advanced Micro Devices Inc',
        aliases: ['AMD', 'Advanced Micro Devices'],
        executives: ['Lisa Su', 'Devinder Kumar', 'Mark Papermaster'],
        products: ['Ryzen', 'Radeon', 'EPYC', 'Threadripper', 'Instinct'],
        contextPositive: ['Santa Clara', 'semiconductor', 'CPU', 'GPU', 'processor'],
        contextNegative: []
    },
    INTC: {
        symbol: 'INTC',
        primary: 'Intel Corporation',
        aliases: ['Intel'],
        executives: ['Pat Gelsinger', 'David Zinsner', 'Michelle Johnston Holthaus'],
        products: ['Core', 'Xeon', 'Arc', 'Optane', 'Foundry Services'],
        contextPositive: ['Santa Clara', 'semiconductor', 'chip', 'processor', 'CPU'],
        contextNegative: ['intelligence', 'intel']
    }
};
// Helper function to get all tickers
export const getAllTickers = () => Object.keys(companyMappings);
// Helper function to search by company name
export const findTickerByName = (name) => {
    const normalizedName = name.toLowerCase().trim();
    for (const [ticker, mapping] of Object.entries(companyMappings)) {
        if (mapping.primary.toLowerCase() === normalizedName)
            return ticker;
        for (const alias of mapping.aliases) {
            if (alias.toLowerCase() === normalizedName)
                return ticker;
        }
    }
    return undefined;
};
// Helper function to find ticker by executive name
export const findTickerByExecutive = (executiveName) => {
    const normalized = executiveName.toLowerCase().trim();
    for (const [ticker, mapping] of Object.entries(companyMappings)) {
        for (const exec of mapping.executives) {
            if (exec.toLowerCase() === normalized)
                return ticker;
        }
    }
    return undefined;
};
// Helper function to find ticker by product
export const findTickerByProduct = (productName) => {
    const normalized = productName.toLowerCase().trim();
    for (const [ticker, mapping] of Object.entries(companyMappings)) {
        for (const product of mapping.products) {
            if (product.toLowerCase() === normalized)
                return ticker;
        }
    }
    return undefined;
};
