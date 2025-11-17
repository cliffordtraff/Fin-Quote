// IndexedDB service for storing news articles with 7-day retention
// Provides offline support and instant article access

interface NewsArticle {
  title: string
  url: string
  source: string
  publishedAt: string
  summary: string
}

interface StoredArticles {
  symbol: string
  articles: NewsArticle[]
  fetchedAt: string
  lastAccessed: string
}

const DB_NAME = 'WatchlistNewsDB'
const DB_VERSION = 1
const STORE_NAME = 'articles'
const RETENTION_DAYS = 7
const MAX_ARTICLES_PER_SYMBOL = 20

class NewsStorageService {
  private db: IDBDatabase | null = null
  private dbPromise: Promise<IDBDatabase> | null = null

  // Initialize the database
  private async initDB(): Promise<IDBDatabase> {
    if (this.db) return this.db
    if (this.dbPromise) return this.dbPromise

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB not available'))
        return
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error)
        reject(request.error)
      }

      request.onsuccess = () => {
        this.db = request.result
        resolve(this.db)
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'symbol' })
          
          // Create indexes for efficient querying
          store.createIndex('fetchedAt', 'fetchedAt', { unique: false })
          store.createIndex('lastAccessed', 'lastAccessed', { unique: false })
        }
      }
    })

    return this.dbPromise
  }

  // Store articles for a symbol
  async storeArticles(symbol: string, articles: NewsArticle[]): Promise<void> {
    try {
      const db = await this.initDB()
      const transaction = db.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)

      // Limit articles to prevent excessive storage
      const limitedArticles = articles.slice(0, MAX_ARTICLES_PER_SYMBOL)

      const data: StoredArticles = {
        symbol,
        articles: limitedArticles,
        fetchedAt: new Date().toISOString(),
        lastAccessed: new Date().toISOString()
      }

      const request = store.put(data)
      
      return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve()
        request.onerror = () => {
          console.error('Failed to store articles:', request.error)
          reject(request.error)
        }
      })
    } catch (error) {
      console.error('Error storing articles:', error)
    }
  }

  // Get articles for a symbol
  async getArticles(symbol: string): Promise<NewsArticle[] | null> {
    try {
      const db = await this.initDB()
      const transaction = db.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      
      const request = store.get(symbol)

      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          const data = request.result as StoredArticles | undefined
          
          if (!data) {
            resolve(null)
            return
          }

          // Check if articles are within retention period
          const fetchedDate = new Date(data.fetchedAt)
          const daysSinceFetch = (Date.now() - fetchedDate.getTime()) / (1000 * 60 * 60 * 24)
          
          if (daysSinceFetch > RETENTION_DAYS) {
            // Articles are too old, delete them
            store.delete(symbol)
            resolve(null)
            return
          }

          // Update last accessed time
          data.lastAccessed = new Date().toISOString()
          store.put(data)

          resolve(data.articles)
        }

        request.onerror = () => {
          console.error('Failed to get articles:', request.error)
          reject(request.error)
        }
      })
    } catch (error) {
      console.error('Error getting articles:', error)
      return null
    }
  }

  // Check if we have cached articles for a symbol
  async hasArticles(symbol: string): Promise<boolean> {
    const articles = await this.getArticles(symbol)
    return articles !== null && articles.length > 0
  }

  // Get article age in milliseconds
  async getArticleAge(symbol: string): Promise<number | null> {
    try {
      const db = await this.initDB()
      const transaction = db.transaction([STORE_NAME], 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      
      const request = store.get(symbol)

      return new Promise((resolve) => {
        request.onsuccess = () => {
          const data = request.result as StoredArticles | undefined
          
          if (!data) {
            resolve(null)
            return
          }

          const fetchedDate = new Date(data.fetchedAt)
          resolve(Date.now() - fetchedDate.getTime())
        }

        request.onerror = () => {
          resolve(null)
        }
      })
    } catch (error) {
      return null
    }
  }

  // Prune old articles (remove articles older than 7 days)
  async pruneOldArticles(): Promise<number> {
    try {
      const db = await this.initDB()
      const transaction = db.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      
      const request = store.openCursor()
      let deletedCount = 0
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS)

      return new Promise((resolve) => {
        request.onsuccess = () => {
          const cursor = request.result
          
          if (cursor) {
            const data = cursor.value as StoredArticles
            const fetchedDate = new Date(data.fetchedAt)
            
            if (fetchedDate < cutoffDate) {
              cursor.delete()
              deletedCount++
            }
            
            cursor.continue()
          } else {
            // Done iterating
            if (deletedCount > 0) {
              console.log(`Pruned ${deletedCount} old article sets`)
            }
            resolve(deletedCount)
          }
        }

        request.onerror = () => {
          console.error('Error during pruning:', request.error)
          resolve(0)
        }
      })
    } catch (error) {
      console.error('Error pruning articles:', error)
      return 0
    }
  }

  // Get storage size estimate
  async getStorageInfo(): Promise<{ usage: number; quota: number } | null> {
    try {
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate()
        return {
          usage: estimate.usage || 0,
          quota: estimate.quota || 0
        }
      }
      return null
    } catch (error) {
      console.error('Error getting storage info:', error)
      return null
    }
  }

  // Clear all stored articles
  async clearAll(): Promise<void> {
    try {
      const db = await this.initDB()
      const transaction = db.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      
      const request = store.clear()

      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          console.log('Cleared all stored articles')
          resolve()
        }
        request.onerror = () => {
          console.error('Failed to clear articles:', request.error)
          reject(request.error)
        }
      })
    } catch (error) {
      console.error('Error clearing articles:', error)
    }
  }

  // Get all stored symbols
  async getStoredSymbols(): Promise<string[]> {
    try {
      const db = await this.initDB()
      const transaction = db.transaction([STORE_NAME], 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      
      const request = store.getAllKeys()

      return new Promise((resolve) => {
        request.onsuccess = () => {
          resolve(request.result as string[])
        }
        request.onerror = () => {
          resolve([])
        }
      })
    } catch (error) {
      console.error('Error getting stored symbols:', error)
      return []
    }
  }
}

// Export singleton instance
export const newsStorage = new NewsStorageService()

// Auto-prune on initialization (run after 10 seconds)
if (typeof window !== 'undefined') {
  setTimeout(() => {
    newsStorage.pruneOldArticles().catch(console.error)
  }, 10000)
  
  // Set up daily pruning
  setInterval(() => {
    newsStorage.pruneOldArticles().catch(console.error)
  }, 24 * 60 * 60 * 1000) // Every 24 hours
}