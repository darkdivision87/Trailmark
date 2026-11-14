// Data store for activity entries
const fs = require('fs').promises;
const path = require('path');
const { app } = require('electron');

class Store {
  constructor() {
    // Get userData directory
    this.dataPath = path.join(app.getPath('userData'), 'trailmark-data.json');
    
    // Initialize empty store if file doesn't exist
    this.ready = this.init();
    this.queue = this.ready;
  }
  
  async init() {
    try {
      await fs.mkdir(path.dirname(this.dataPath), { recursive: true });
      await fs.access(this.dataPath);
      console.log('Data store initialized:', this.dataPath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      // File doesn't exist, create with empty array
      await this.saveData([]);
      console.log('Created new data store:', this.dataPath);
    }
  }
  
  /**
   * Add a new entry to the store
   */
  addEntry(entry) {
    const snapshot = JSON.parse(JSON.stringify(entry));
    const task = this.queue.then(() => this.writeEntry(snapshot));
    this.queue = task.catch(() => {});
    return task;
  }

  async writeEntry(entry) {
    try {
      const data = await this.loadData();
      
      // Update the current session instead of duplicating cumulative durations.
      const index = data.findIndex(item => item.id === entry.id);
      if (index < 0) data.push(entry);
      else data[index] = {...data[index], ...entry, projectId: data[index].projectId};
      
      // Prune old entries (keep only last 30 days)
      const cutoffTime = Date.now() - (require('./preferences').settings.retentionDays * 24 * 60 * 60 * 1000); // 30 days ago
      const prunedData = data.filter(item => item.timestamp > cutoffTime);
      
      await this.saveData(prunedData);
      

      return true;
    } catch (error) {
      console.error('Error adding entry:', error);
      throw error;
    }
  }
  
  /**
   * Get all entries
   */
  async getEntries() {
    await this.queue;
    try {
      const data = await this.loadData();
      // Sort by timestamp descending (newest first)
      return data.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Get entries for a specific time range
   */
  async getEntriesByTimeRange(startTime, endTime) {
    try {
      const data = await this.loadData();
      
      // Filter by date range
      const filtered = data.filter(item => 
        item.timestamp >= startTime && item.timestamp <= endTime
      );
      
      return filtered.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      console.error('Error getting entries by time range:', error);
      return [];
    }
  }
  
  /**
   * Get summary statistics 
   */
  async getSummary() {
    try {
      const data = await this.getEntries();
      
      // Group by app and calculate total durations
      const apps = Object.create(null);
      let totalDuration = 0;
      
      for (const entry of data) {
        const appName = entry.window?.title || 'Unknown App';
        
        if (!apps[appName]) {
          apps[appName] = { 
            duration: 0, 
            count: 0,
            lastUsed: 0
          };
        }
        
        apps[appName].duration += entry.duration;
        apps[appName].count++;
        apps[appName].lastUsed = Math.max(apps[appName].lastUsed, entry.timestamp);
        
        totalDuration += entry.duration;
      }
      
      // Convert duration to hours/minutes for better display
      const formatDuration = (seconds) => {
        if (seconds < 60) return `${Math.round(seconds)}s`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
        return `${(seconds / 3600).toFixed(1)}h`;
      };
      
      // Sort apps by duration descending
      const sortedApps = Object.entries(apps)
        .map(([name, data]) => ({
          name,
          ...data,
          formattedDuration: formatDuration(data.duration)
        }))
        .sort((a, b) => b.duration - a.duration);
      
      return {
        totalDuration,
        apps: sortedApps,
        entriesCount: data.length
      };
    } catch (error) {
      console.error('Error getting summary:', error);
      return { totalDuration: 0, apps: [], entriesCount: 0 };
    }
  }
  
  /**
   * Load data from file
   */
  async loadData() {
    await this.ready;
    try {
      const data = await fs.readFile(this.dataPath, 'utf8');
      const entries = JSON.parse(data);
      if (!Array.isArray(entries)) throw new Error('Invalid activity data');
      return entries;
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }
  
  /**
   * Save data to file with atomic write
   */
  async saveData(data) {
    try {
      // Create temporary filename for atomic write
      const tempPath = this.dataPath + '.tmp';
      
      // Write to temporary file first
      await fs.writeFile(tempPath, JSON.stringify(data, null, 2));
      
      // Atomically replace the original file
      // Windows can temporarily lock the destination while it is being read.
      for (let attempt = 0; ; attempt++) {
        try { await fs.rename(tempPath, this.dataPath); break; }
        catch (error) {
          if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt >= 5) throw error;
          await new Promise(resolve => setTimeout(resolve, 25 * (attempt + 1)));
        }
      }
      
      return true;
    } catch (error) {
      console.error('Error saving data:', error);
      throw error;
    }
  }
  
  /**
   * Clear all stored data
   */
  assignProject(id, projectId) {
    const task = this.queue.then(async () => {
      const data = await this.loadData();
      const entry = data.find(e => e.id === id);
      if (!entry) throw new Error('Activity no longer exists.');
      const projects = (await require('./preferences').get()).projects;
      if (projectId && !projects.some(p => p.id === projectId)) throw new Error('Project no longer exists.');
      if (projectId === null) delete entry.projectId;
      else entry.projectId = projectId || '';
      await this.saveData(data);
      return true;
    });
    this.queue = task.catch(() => {});
    return task;
  }

  clear() {
    const task = this.queue.then(() => this.saveData([]));
    this.queue = task.catch(() => {});
    return task;
  }

}

module.exports = Store;