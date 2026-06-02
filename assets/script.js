// ============================================================================
// CONFIGURATION & GLOBAL STATE
// ============================================================================
// Base URL for Flask backend API endpoints
const API_BASE_URL = window.location.origin;
 
// Global state variables for map interactions and data management
let currentROI = null;              // Currently drawn Region of Interest geometry
let extractedData = null;           // Extracted feature data from selected image
let predictionData = null;          // Drought prediction results
let chartData = null;               // Statistical data for chart visualization
let layerControl = null;            // Leaflet layer control instance
let distributionChart = null;       // Chart.js instance for data visualization
let availableImages = [];           // List of available Landsat images in date range
let selectedImageIndex = 0;         // Current selected image index in slider
let selectedImageLayer = null;      // Leaflet layer for currently selected image
let currentDateRange = { start: null, end: null }; // Selected date range for image filtering
let hasPrediction = false;          // Flag indicating if prediction has been run
let overlayLayer = null;            // Overlay layer for classification visualization
let helpContent = null;             // Help content loaded from JSON file

// ============================================================================
// HELP CONTENT LOADER
// ============================================================================
/**
 * Loads help content from JSON file and caches it
 * @returns {Promise<Object>} Help content object
 */
async function loadHelpContent() {
    if (helpContent) return helpContent;
    
    try {
        const response = await fetch(`${API_BASE_URL}/help-content.json`);
        if (!response.ok) throw new Error('Failed to load help content');
        helpContent = await response.json();
        return helpContent;
    } catch (error) {
        console.error('Error loading help content:', error);
        return null;
    }
}

/**
 * Renders help content HTML for the specified project
 * @param {string} project - Project type: 'drought', 'organic', or 'dataviz'
 * @returns {string} HTML string for help content
 */
function renderHelpContent(project) {
    if (!helpContent || !helpContent[project]) {
        return '<p>Help content unavailable.</p>';
    }
    
    const content = helpContent[project];
    let html = '';
    
    // Description
    html += `<p class="help-description">${content.description}</p>`;
    
    // How to Use section
    html += `<div class="help-section-block">`;
    html += `<p class="help-section-title"><strong>How to Use</strong></p>`;
    html += `<p class="help-intro">${content.howToUse.intro}</p>`;
    html += `<ol class="help-steps">`;
    content.howToUse.steps.forEach(step => {
        html += `<li><strong>${step.title}:</strong> ${step.description}</li>`;
    });
    html += `</ol></div>`;
    
    // Features section
    html += `<div class="help-section-block">`;
    html += `<p class="help-section-title"><strong>Features</strong></p>`;
    html += `<ul class="help-features">`;
    content.features.forEach(feature => {
        html += `<li>${feature}</li>`;
    });
    html += `</ul></div>`;
    
    // Indices/Parameters section (for drought and organic)
    if (content.indices) {
        html += `<div class="help-section-block">`;
        html += `<p class="help-section-title"><strong>${content.indices.title}</strong></p>`;
        html += `<dl class="help-indices">`;
        content.indices.items.forEach(item => {
            html += `<dt><strong>${item.name}</strong> <span class="help-index-fullname">(${item.fullName})</span></dt>`;
            html += `<dd>${item.description}</dd>`;
        });
        html += `</dl></div>`;
    }
    
    // Data Format section (for dataviz)
    if (content.dataFormat) {
        html += `<div class="help-section-block">`;
        html += `<p class="help-section-title"><strong>${content.dataFormat.title}</strong></p>`;
        html += `<table class="help-data-format-table">`;
        html += `<thead><tr><th>Column</th><th>Format</th><th>Description</th></tr></thead>`;
        html += `<tbody>`;
        content.dataFormat.columns.forEach(col => {
            html += `<tr><td><code>${col.name}</code></td><td>${col.format}</td><td>${col.description}</td></tr>`;
        });
        html += `</tbody></table></div>`;
    }
    
    // Tips section
    if (content.tips && content.tips.length > 0) {
        html += `<div class="help-section-block">`;
        html += `<p class="help-section-title"><strong>Tips</strong></p>`;
        html += `<ul class="help-tips">`;
        content.tips.forEach(tip => {
            html += `<li>${tip}</li>`;
        });
        html += `</ul></div>`;
    }
    
    return html;
}

/**
 * Updates the help section content based on current project
 */
async function updateHelpSection() {
    await loadHelpContent();
    
    const helpContentContainer = document.querySelector('#help-section .help-content');
    if (helpContentContainer && helpContent) {
        helpContentContainer.innerHTML = renderHelpContent('drought');
    }
}

// ============================================================================
// LOGGING UTILITY
// ============================================================================
/**
 * Updates the header log display with status messages
 * @param {string} message - Message to display in log
 */
function updateLog(message) {
    const logDisplay = document.getElementById('log-display');
    const logText = logDisplay?.querySelector('.log-text');
    if (logText) {
        logText.textContent = message;
    }
}

// ============================================================================
// MAP INITIALIZATION
// ============================================================================
// Initialize Leaflet map centered on Java Island
const map = L.map('map', {
    center: [-7.25, 109.40],
    zoom: 10,
    zoomControl: true,
});

// Base map layers
const osmBase = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// Google Satellite with labels and roads (hybrid)
const googleSatHybrid = L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    attribution: 'Google'
});

// Google Satellite without labels (pure satellite)
const googleSat = L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    attribution: 'Google'
});

// Drawing layer for ROI (Region of Interest)
const drawnItems = new L.FeatureGroup().addTo(map);
map.addControl(new L.Control.Draw({
    edit: { featureGroup: drawnItems },
    draw: {
        polygon: true,
        rectangle: true,
        polyline: false,
        circle: false,
        marker: false,
        circlemarker: false
    }
}))

// ============================================================================
// DOM ELEMENT REFERENCES
// ============================================================================
// UI Elements - Loaders and modals
const loader = document.getElementById('loader');
const loaderText = document.getElementById('loader-text');
const coordsDisplay = document.getElementById('coords-display');
const resetModal = document.getElementById('reset-modal');

// UI Elements - Control buttons
const extractBtn = document.getElementById('extract-btn');
const predictBtn = document.getElementById('predict-btn');
const downloadBtn = document.getElementById('download-btn');
const resetBtn = document.getElementById('reset-btn');
const cancelResetBtn = document.getElementById('cancel-reset-btn');
const confirmResetBtn = document.getElementById('confirm-reset-btn');
const selectImageBtn = document.getElementById('select-image-btn');

// UI Elements - Date and slider inputs
const imageStartDate = document.getElementById('image-start-date');
const imageEndDate = document.getElementById('image-end-date');
const imageSlider = document.getElementById('image-slider');
const cloudCoverSlider = document.getElementById('cloud-cover-slider');
const cloudCoverValue = document.getElementById('cloud-cover-value');

// UI Elements - Theme toggle
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const themeSunIcon = document.getElementById('theme-icon-sun');
const themeMoonIcon = document.getElementById('theme-icon-moon');

// ============================================================================
// THEME MANAGEMENT
// ============================================================================
/**
 * Initializes theme based on localStorage or defaults to dark
 */
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    setTheme(savedTheme);
}

/**
 * Sets and persists the application theme
 * @param {string} theme - 'light' or 'dark'
 */
function setTheme(theme) {
    const html = document.documentElement;
    if (theme === 'light') {
        html.setAttribute('data-theme', 'light');
        themeSunIcon?.classList.add('hidden');
        themeMoonIcon?.classList.remove('hidden');
    } else {
        html.removeAttribute('data-theme');
        themeSunIcon?.classList.remove('hidden');
        themeMoonIcon?.classList.add('hidden');
    }
    localStorage.setItem('theme', theme);
    
    // Update chart colors if chart exists
    updateChartTheme();
}

/**
 * Toggles between light and dark themes
 */
function toggleTheme() {
    const currentTheme = document.documentElement.hasAttribute('data-theme') ? 'light' : 'dark';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
}

/**
 * Updates chart colors when theme changes
 */
function updateChartTheme() {
    if (distributionChart) {
        const isDark = !document.documentElement.hasAttribute('data-theme') || document.documentElement.getAttribute('data-theme') === 'dark';
        const labelColor = isDark ? '#94a9c4' : '#4a5f59';
        const gridColor = isDark ? 'rgba(148, 169, 196, 0.1)' : 'rgba(33, 191, 115, 0.1)';
        const barBgColor = isDark ? 'rgba(37, 99, 235, 0.6)' : 'rgba(33, 191, 115, 0.6)';
        const barBorderColor = isDark ? 'rgba(37, 99, 235, 1)' : 'rgba(33, 191, 115, 1)';
        const tooltipBg = isDark ? 'rgba(8, 18, 38, 0.95)' : 'rgba(255, 255, 255, 0.95)';
        const tooltipTitleColor = isDark ? '#f5f9ff' : '#1a2e29';
        const tooltipBodyColor = isDark ? '#94a9c4' : '#4a5f59';
        const tooltipBorderColor = isDark ? 'rgba(148, 169, 196, 0.3)' : 'rgba(33, 191, 115, 0.3)';
        
        // Update legend colors
        distributionChart.options.plugins.legend.labels.color = labelColor;
        
        // Update axis colors
        distributionChart.options.scales.x.title.color = labelColor;
        distributionChart.options.scales.x.ticks.color = labelColor;
        distributionChart.options.scales.x.grid.color = gridColor;
        distributionChart.options.scales.y.title.color = labelColor;
        distributionChart.options.scales.y.ticks.color = labelColor;
        distributionChart.options.scales.y.grid.color = gridColor;
        
        // Update bar colors
        distributionChart.data.datasets[0].backgroundColor = barBgColor;
        distributionChart.data.datasets[0].borderColor = barBorderColor;
        
        // Update tooltip colors
        distributionChart.options.plugins.tooltip.backgroundColor = tooltipBg;
        distributionChart.options.plugins.tooltip.titleColor = tooltipTitleColor;
        distributionChart.options.plugins.tooltip.bodyColor = tooltipBodyColor;
        distributionChart.options.plugins.tooltip.borderColor = tooltipBorderColor;
        
        distributionChart.update();
    }
}

// ============================================================================
// EVENT LISTENERS - PAGE INITIALIZATION
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    loadInitialLayer();
    // Initialize Analysis section to show placeholders on page load
    initializeAnalysisSection();
    // Initialize table previews to show placeholders
    renderTablePreview(null);
});

// ============================================================================
// EVENT LISTENERS - MAP INTERACTIONS
// ============================================================================
map.on(L.Draw.Event.CREATED, handleDrawEvent);
map.on('mousemove', handleMouseMove);
map.whenReady(() => {
    setTimeout(() => map.invalidateSize(), 200);
});

// ============================================================================
// EVENT LISTENERS - UI CONTROLS
// ============================================================================
// Action buttons
if (extractBtn) extractBtn.addEventListener('click', handleExtractClick);
if (predictBtn) predictBtn.addEventListener('click', handlePredictClick);
if (downloadBtn) downloadBtn.addEventListener('click', handleDownloadClick);

// Modal controls
if (resetBtn) resetBtn.addEventListener('click', () => toggleModal('reset-modal', true));
if (cancelResetBtn) cancelResetBtn.addEventListener('click', () => toggleModal('reset-modal', false));
if (confirmResetBtn) confirmResetBtn.addEventListener('click', () => location.reload());

// Image selection controls
if (selectImageBtn) selectImageBtn.addEventListener('click', handleSelectImageClick);
if (imageStartDate) imageStartDate.addEventListener('change', handleDateChange);
if (imageEndDate) imageEndDate.addEventListener('change', handleDateChange);

// Cloud cover slider controls
if (cloudCoverSlider) cloudCoverSlider.addEventListener('input', handleCloudCoverChange);
if (cloudCoverSlider) cloudCoverSlider.addEventListener('change', handleDateChange);

// Image slider controls (display only on drag, load on release)
if (imageSlider) {
    imageSlider.addEventListener('input', handleSliderChange);
    imageSlider.addEventListener('change', handleSliderRelease);
}

// Theme toggle control
if (themeToggleBtn) themeToggleBtn.addEventListener('click', toggleTheme);

// ============================================================================
// API FUNCTIONS - INITIAL DATA LOADING
// ============================================================================
/**
 * Initializes layer control with basemaps and Landsat overlay
 * Called on page load and when switching projects
 */
function initializeLayerControl() {
    const baseMaps = {
        "OpenStreetMap": osmBase,
        "GoogleSat": googleSat,
        "GoogleSatHybrid": googleSatHybrid
    };
    
    const overlayMaps = {};
    
    // Add Landsat overlay if available
    if (selectedImageLayer) {
        overlayMaps["Landsat"] = selectedImageLayer;
    }
    
    if (layerControl) map.removeControl(layerControl);
    layerControl = L.control.layers(baseMaps, overlayMaps, { collapsed: false }).addTo(map);
}

/**
 * Loads the initial Landsat 9 base layer on map
 */
async function loadInitialLayer() {
    showLoader('Loading base layer...');
    try {
        const res = await fetch(`${API_BASE_URL}/api/initial-layer`);
        if (!res.ok) throw new Error('Server error');
        const data = await res.json();
        if (data.status === 'success') {
            // Store in selectedImageLayer global variable so it persists
            // This ensures the initial layer is tracked and can be replaced later
            selectedImageLayer = L.tileLayer(data.url, { 
                attribution: 'GEE - Initial Default Image' 
            }).addTo(map); 
            
            // Initialize layer control with basemaps and Landsat
            initializeLayerControl();
        } else {
            throw new Error(data.message || 'Unknown error fetching initial layer');
        }
    } catch (e) {
        updateLog(`Failed to load GEE layer: ${e.message}`);
    } finally {
        hideLoader();
        setTimeout(() => map.invalidateSize(), 300);
    }
}

// ============================================================================
// MAP EVENT HANDLERS
// ============================================================================
/**
 * Handles ROI drawing completion event
 * @param {Object} e - Leaflet draw event
 */
function handleDrawEvent(e) {
    drawnItems.clearLayers().addLayer(e.layer);
    currentROI = e.layer.toGeoJSON();
    updateLog('ROI drawn successfully');
}

/**
 * Updates coordinate display on mouse move
 * @param {Object} e - Leaflet mouse event
 */
function handleMouseMove(e) {
    if (coordsDisplay) {
        coordsDisplay.textContent = `Lat: ${e.latlng.lat.toFixed(4)} | Lng: ${e.latlng.lng.toFixed(4)}`;
    }
} 

// ============================================================================
// DATA EXTRACTION HANDLER
// ============================================================================
/**
 * Handles feature extraction from selected image within ROI
 * Extracts spectral indices (NDVI, NDWI, NDDI, EVI, LST) for analysis
 */
async function handleExtractClick() {
    if (!currentROI) { 
        updateLog('Please draw ROI first');
        return; 
    }
    
    showLoader('Extracting spectral indices...');
    updateLog('Starting spectral index extraction...');
    if (downloadBtn) downloadBtn.classList.add('hidden');
    if (predictBtn) predictBtn.disabled = true;
    
    // Reset prediction state
    hasPrediction = false;
    predictionData = null;
    const droughtBtn = document.getElementById('drought-btn');
    if (droughtBtn) droughtBtn.classList.add('hidden');
    
    try {
        const requestBody = { 
            project: 'drought',
            roi: currentROI 
        };
        
        // Include selected image info if available
        if (availableImages.length > 0 && currentDateRange.start && currentDateRange.end) {
            const cloudCover = cloudCoverSlider?.value || 20;
            requestBody.start_date = currentDateRange.start;
            requestBody.end_date = currentDateRange.end;
            requestBody.image_index = selectedImageIndex;
            requestBody.cloud_thresh = parseInt(cloudCover);
            updateLog(`Extracting from: ${availableImages[selectedImageIndex].date}`);
        }
        
        const res = await fetch(`${API_BASE_URL}/api/extract`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        if (!res.ok) throw new Error((await res.json()).message);
        
        const result = await res.json();
        extractedData = result.data;
        
        // Initialize right sidebar analysis section
        initializeAnalysisSection();
        
        if (predictBtn) predictBtn.disabled = false;
        if (downloadBtn) downloadBtn.classList.remove('hidden');
        updateLog(`Successfully extracted ${extractedData.length} spectral index data points`);
    } catch (error) { 
        updateLog(`Drought extraction failed: ${error.message}`);
    } 
    finally { hideLoader(); }
}

// ============================================================================
// DROUGHT PREDICTION HANDLER
// ============================================================================
/**
 * Runs drought prediction model on extracted features
 * Classifies each pixel into Low/Medium/High drought categories
 */
async function handlePredictClick() {
    if (!currentROI) {
        updateLog('ROI not found - draw ROI first');
        return;
    }
    
    if (!extractedData || extractedData.length === 0) {
        updateLog('No extracted data - extract features first');
        return;
    }
    
    showLoader('Analyzing drought patterns...');
    updateLog('Running drought classification model...');

    try {
        const res = await fetch(`${API_BASE_URL}/api/predict`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                project: 'drought',
                roi: currentROI,
                extractedData: extractedData  // Send the already extracted data
            })
        });
        if (!res.ok) throw new Error((await res.json()).message)
        const result = await res.json();
        chartData = result.predictionStats;
        predictionData = result.predictionData;  // Contains prediction data with DROUGHT column
        hasPrediction = true;
        
        // Update map visualization
        if (result.visualizeLayers) {
            updateMapLayers(result.visualizeLayers);
        }
        
        // Update table with prediction data
        renderTablePreview(predictionData);
        
        // Show drought prediction button
        const droughtBtn = document.getElementById('drought-btn');
        if (droughtBtn) {
            droughtBtn.classList.remove('hidden');
        }
        
        updateLog('Drought classification completed successfully');
    } catch (error) { 
        updateLog(`Drought prediction failed: ${error.message}`);
        alert("Prediction Failed: " + error.message); 
    } 
    finally { hideLoader(); }
}

// ============================================================================
// MAP LAYER MANAGEMENT
// ============================================================================
/**
 * Updates map layers after prediction to show drought visualization
 * Maintains proper z-index stacking: Prediction > Indices > Landsat 9
 * Always uses the last selected Landsat image (selectedImageLayer global)
 * @param {Array} layersData - Array of layer objects with name and URL
 */
function updateMapLayers(layersData) {
    // Safety check: return early if layersData is undefined or not an array
    if (!layersData || !Array.isArray(layersData)) {
        return;
    }
    
    if (layerControl) map.removeControl(layerControl);
    
    // ALWAYS use selectedImageLayer - this is the user's last selected image
    // Either the initial default OR the image selected via slider
    // No fallback logic - selectedImageLayer is the single source of truth
    const landsat9Layer = selectedImageLayer;
    
    const baseMaps = {
        "OpenStreetMap": osmBase,
        "Google Satellite": googleSat,
        "Google Satellite + Labels": googleSatHybrid
    };
    
    // Build overlayMaps in reverse order for layer control display
    // (Leaflet shows first-added at top, but we want Prediction at top)
    const overlayMaps = {};
    
    // 1. Add Landsat first (will appear at bottom of list)
    if (landsat9Layer) {
        overlayMaps['Landsat'] = landsat9Layer;
    }
    
    // 2. Add other index layers (will appear in middle)
    const predictionLayer = layersData.find(l => l.name === 'Prediction');
    const otherLayers = layersData.filter(l => l.name !== 'Prediction');
    
    otherLayers.forEach(layerData => {
        overlayMaps[layerData.name] = L.tileLayer(layerData.url, { attribution: 'GEE' });
    });
    
    // 3. Add Prediction layer last (will appear at top of list)
    if (predictionLayer) {
        overlayMaps['Prediction'] = L.tileLayer(predictionLayer.url, { attribution: 'GEE' });
    }

    layerControl = L.control.layers(baseMaps, overlayMaps, { collapsed: false }).addTo(map);
    
    // Add prediction layer to map with higher z-index
    if (overlayMaps['Prediction']) {
        overlayMaps['Prediction'].setZIndex(1000).addTo(map);
    }
    
    // Set z-index for other layers to ensure proper stacking
    let zIndex = 500;
    otherLayers.forEach(layerData => {
        if (overlayMaps[layerData.name]) {
            overlayMaps[layerData.name].setZIndex(zIndex);
            zIndex++;
        }
    });
    
    // Ensure Landsat stays at lowest z-index
    if (landsat9Layer) {
        landsat9Layer.setZIndex(100);
    }
}

function handleDownloadClick() {
    // Download drought analysis data
    const dataToDownload = hasPrediction ? predictionData : extractedData;
    
    if (!dataToDownload || !dataToDownload.length) {
        updateLog('No drought analysis data available');
        return;
    }

    // Get image date for filename
    let imageDate = 'unknown';
    if (availableImages.length > 0 && selectedImageIndex < availableImages.length) {
        imageDate = availableImages[selectedImageIndex].date.replace(/-/g, ''); // YYYYMMDD format
    }

    const headers = Object.keys(dataToDownload[0]);
    
    // Build CSV with proper formatting
    const csvRows = [headers.join(',')];
    
    dataToDownload.forEach(row => {
        const values = headers.map(header => {
            let value = row[header];
            
            // Handle different data types
            if (value === null || value === undefined) {
                return '';
            } else if (typeof value === 'number') {
                // Format numbers with proper decimal precision
                // Check if it's an integer (like prediction class)
                if (Number.isInteger(value) && header === 'prediction') {
                    return value.toString();
                } else {
                    // Use appropriate precision based on column
                    // Coordinates need more precision, indices need 6 decimals
                    if (header === 'longitude' || header === 'latitude') {
                        return value.toFixed(8);
                    } else {
                        return value.toFixed(6);
                    }
                }
            } else if (typeof value === 'string') {
                // Wrap text values in quotes, especially for DROUGHT column
                const escaped = value.replace(/"/g, '""');
                return `"${escaped}"`;
            } else {
                return JSON.stringify(value);
            }
        });
        csvRows.push(values.join(','));
    });
    
    const csvContent = "data:text/csv;charset=utf-8," + csvRows.join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    
    // Create filename with image date
    const filePrefix = hasPrediction ? 'prediction_results' : 'extraction_results';
    const filename = `${filePrefix}_${imageDate}.csv`;
    
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    updateLog(`Drought analysis data downloaded: ${filename}`);
}

// ============================================================================
// UI UTILITY FUNCTIONS
// ============================================================================
/**
 * Toggles modal visibility
 * @param {string} id - Modal element ID
 * @param {boolean} show - Whether to show or hide
 */
function toggleModal(id, show) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList[show ? 'remove' : 'add']('hidden');
}

/**
 * Shows loading overlay with custom message
 * @param {string} text - Loading message text
 */
function showLoader(text) {
    if (loaderText) loaderText.textContent = text;
    if (loader) loader.classList.remove('hidden');
}

/**
 * Hides loading overlay
 */
function hideLoader() {
    if (loader) loader.classList.add('hidden');
}

// ============================================================================
// IMAGE SELECTION HANDLERS
// ============================================================================
/**
 * Updates cloud cover display value during slider drag
 * @param {Event} event - Input event from cloud cover slider
 */
function handleCloudCoverChange(event) {
    const value = event.target.value;
    if (cloudCoverValue) {
        cloudCoverValue.textContent = `${value}%`;
    }
}

/**
 * Fetches available Landsat images for selected date range and cloud cover
 * Auto-loads first image and enables extraction controls
 */
async function handleDateChange() {
    const startDate = imageStartDate?.value;
    const endDate = imageEndDate?.value;
    const cloudCover = cloudCoverSlider?.value || 20;
    
    if (!startDate || !endDate) {
        updateLog('Select date range');
        return;
    }
    
    // Validate date range
    if (new Date(startDate) >= new Date(endDate)) {
        updateLog('Start date must be before end date');
        return;
    }
    
    showLoader('Fetching images...');
    updateLog('Fetching available images...');
    
    try {
        const res = await fetch(`${API_BASE_URL}/api/get-images`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                start_date: startDate, 
                end_date: endDate,
                cloud_thresh: parseInt(cloudCover)
            })
        });
        
        const data = await res.json();
        
        if (data.status === 'error') {
            updateLog(data.message);
            availableImages = [];
            if (imageSlider) {
                imageSlider.disabled = true;
                imageSlider.max = 0;
                imageSlider.value = 0;
            }
            if (selectImageBtn) selectImageBtn.disabled = true;
            updateLog('No images found');
            return;
        }
        
        availableImages = data.images;
        currentDateRange = { start: startDate, end: endDate };
        
        // Update slider
        if (imageSlider) {
            imageSlider.disabled = false;
            imageSlider.max = Math.max(0, availableImages.length - 1);
            imageSlider.value = 0;
        }
        
        // Update slider labels
        const imageMinLabel = document.getElementById('image-min-label');
        const imageMaxLabel = document.getElementById('image-max-label');
        const imageCurrentValue = document.getElementById('image-current-value');
        
        if (imageMinLabel) imageMinLabel.textContent = '1';
        if (imageMaxLabel) imageMaxLabel.textContent = Math.max(0, availableImages.length).toString();
        if (imageCurrentValue) imageCurrentValue.textContent = availableImages.length > 0 ? '1' : '0';
        
        if (selectImageBtn) selectImageBtn.disabled = false;
        
        // Update slider label (legacy support)
        const sliderLabel = document.querySelector('.slider-label');
        if (sliderLabel && availableImages.length > 0) {
            sliderLabel.textContent = `Image 1/${availableImages.length}`;
        }
        
        // Show first image info
        const imageDateSpan = document.getElementById('image-date');
        const imageCloudSpan = document.getElementById('image-cloud');
        
        if (availableImages.length > 0) {
            const img = availableImages[0];
            if (imageDateSpan && imageCloudSpan) {
                imageDateSpan.textContent = img.date;
                imageCloudSpan.textContent = `${img.cloud_cover}%`;
            }
            
            updateLog(`Found ${availableImages.length} images (Path ${img.path}, Row ${img.row})`);
        } else {
            // Reset to default "-" if no images
            if (imageDateSpan) imageDateSpan.textContent = '-';
            if (imageCloudSpan) imageCloudSpan.textContent = '-';
        }
        
        // Auto-load the first image and enable extract button
        await loadImageByIndex(0);
        
        // Enable extract button after image is loaded
        if (extractBtn) {
            extractBtn.disabled = false;
        }
        
    } catch (error) {
        updateLog(`Fetch error: ${error.message}`);
    } finally {
        hideLoader();
    }
}

/**
 * Updates image info display during slider drag (no image loading)
 * @param {Event} e - Input event from image slider
 */
function handleSliderChange(e) {
    selectedImageIndex = parseInt(e.target.value);
    
    // Update image info display only (don't load image yet)
    const imageDateSpan = document.getElementById('image-date');
    const imageCloudSpan = document.getElementById('image-cloud');
    const imageCurrentValue = document.getElementById('image-current-value');
    
    if (availableImages.length > 0 && selectedImageIndex < availableImages.length) {
        const img = availableImages[selectedImageIndex];
        
        if (imageDateSpan && imageCloudSpan) {
            imageDateSpan.textContent = img.date;
            imageCloudSpan.textContent = `${img.cloud_cover}%`;
        }
        
        // Update center label with current image number
        if (imageCurrentValue) {
            imageCurrentValue.textContent = `${selectedImageIndex + 1}`;
        }
        
        const sliderLabel = document.querySelector('.slider-label');
        if (sliderLabel) {
            sliderLabel.textContent = `Image ${selectedImageIndex + 1}/${availableImages.length}`;
        }
    } else {
        // Reset to default "-" if no valid image
        if (imageDateSpan) imageDateSpan.textContent = '-';
        if (imageCloudSpan) imageCloudSpan.textContent = '-';
        if (imageCurrentValue) imageCurrentValue.textContent = '0';
    }
}

/**
 * Loads selected image when slider is released (mouseup event)
 * @param {Event} e - Change event from image slider
 */
async function handleSliderRelease(e) {
    // This function is called when user releases the slider (mouseup/touchend)
    // Load the image immediately on release
    if (availableImages.length === 0) return;
    
    selectedImageIndex = parseInt(e.target.value);
    
    if (!currentDateRange.start || !currentDateRange.end) {
        return;
    }
    
    await loadImageByIndex(selectedImageIndex);
}

/**
 * Loads specific Landsat image by index from available images array
 * @param {number} index - Index of image to load
 */
async function loadImageByIndex(index) {
    if (availableImages.length === 0 || index >= availableImages.length) {
        return;
    }
    
    showLoader(`Loading image...`);
    const selectedImage = availableImages[index];
    updateLog(`Loading: ${selectedImage.date} (Cloud: ${selectedImage.cloud_cover}%)`);
    
    try {
        const res = await fetch(`${API_BASE_URL}/api/select-image`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image_id: selectedImage.id,
                date: selectedImage.date,
                cloud_cover: selectedImage.cloud_cover
            })
        });
        
        const data = await res.json();
        
        if (data.status === 'error') {
            throw new Error(data.message);
        }
        
        // Remove previous selected image layer if exists
        if (selectedImageLayer) {
            map.removeLayer(selectedImageLayer);
            // Remove from layer control if it exists
            if (layerControl) {
                layerControl.removeLayer(selectedImageLayer);
            }
        }
        
        // Add new selected image layer
        selectedImageLayer = L.tileLayer(data.url, { 
            attribution: 'GEE - Selected Image',
            opacity: 1.0
        }).addTo(map);
        
        // Center map on the selected image if bounds are provided
        if (data.bounds && data.bounds.center) {
            const [lat, lon] = data.bounds.center;
            map.setView([lat, lon], 10, {
                animate: true,
                duration: 0.5
            });
        }
        
        // Update layer control to show the selected image as "Landsat"
        if (layerControl) {
            // Reinitialize layer control with updated Landsat layer
            initializeLayerControl();
        }
        
        updateLog(`Loaded: ${selectedImage.date} (Path ${selectedImage.path}/${selectedImage.row})`);
        
    } catch (error) {
        updateLog(`Image load error: ${error.message}`);
    } finally {
        hideLoader();
    }
}

/**
 * Handles manual image selection button click
 */
async function handleSelectImageClick() {
    if (availableImages.length === 0) {
        updateLog('Select date range first');
        return;
    }
    
    if (!currentDateRange.start || !currentDateRange.end) {
        updateLog('Invalid date range');
        return;
    }
    
    // Use the helper function to load the image
    await loadImageByIndex(selectedImageIndex);
    
    // Show success message and update log
    if (availableImages[selectedImageIndex]) {
        const selectedImage = availableImages[selectedImageIndex];
        updateLog(`Image selected: ${selectedImage.date} (Cloud: ${selectedImage.cloud_cover}%)`);
        // Remove alert - only show in log
    }
}

// ============================================================================
// DATA VISUALIZATION - INDEX SELECTION
// ============================================================================
// Current selected index for visualization
let currentSelectedIndex = 'NDVI';

/**
 * Initialize index button click handlers for switching between visualizations
 */
document.addEventListener('DOMContentLoaded', () => {
    const indexButtons = document.querySelectorAll('.index-btn');
    indexButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Remove active class from all buttons
            indexButtons.forEach(b => b.classList.remove('active'));
            // Add active class to clicked button
            e.target.classList.add('active');
            // Update selected index
            currentSelectedIndex = e.target.dataset.index;
            // Update visualization based on index type and project
            if (currentSelectedIndex === 'DROUGHT') {
                updateDroughtChart();
            } else if (currentSelectedIndex === 'PREDICTION') {
                // Drought prediction visualization
                updateDroughtChart();
            } else {
                updateDistributionChart(currentSelectedIndex);
            }
        });
    });
});

// ============================================================================
// TABLE PREVIEW RENDERING
// ============================================================================
/**
 * Get display name for column headers
 * @param {string} colName - Column name (N, P, K, etc.)
 * @returns {string} Display name
 */
function getDisplayName(colName) {
    const displayNames = {
        // Organic indices with full names
        'N': 'Nitrogen',
        'P': 'Phosphorus',
        'K': 'Potassium',
        'PH': 'PH',
        'SOM': 'SOM',
        // Coordinates
        'longitude': 'Longitude',
        'latitude': 'Latitude',
        // Drought indices (displayed as-is)
        'NDVI': 'NDVI',
        'NDWI': 'NDWI',
        'NDDI': 'NDDI',
        'EVI': 'EVI',
        'LST': 'LST',
        'DROUGHT': 'DROUGHT',
        'SOIL_TYPE': 'SOIL TYPE'
    };
    return displayNames[colName] || colName;
}

/**
 * Renders extracted or predicted data in table format
 * @param {Array} data - Array of data objects to display
 */
function renderTablePreview(data) {
    const tablePreviewSection = document.getElementById('table-preview-section');
    const tablePreview = document.getElementById('table-preview');
    const tableInfo = document.getElementById('table-info');
    const tableRowCount = document.getElementById('table-row-count');
    const tablePlaceholder = document.getElementById('table-placeholder');
    
    if (!data || data.length === 0) {
        // Show placeholder icon
        if (tablePlaceholder) tablePlaceholder.classList.remove('hidden');
        if (tableInfo) tableInfo.classList.add('hidden');
        
        // Remove any existing table (but keep placeholder)
        const existingTable = tablePreview.querySelector('.preview-table');
        if (existingTable) existingTable.remove();
        
        return;
    }
    
    // Hide placeholder icon (don't remove from DOM)
    if (tablePlaceholder) tablePlaceholder.classList.add('hidden');
    
    // Define columns to show in table based on current project
    const droughtColumns = ['NDVI', 'NDWI', 'NDDI', 'EVI', 'LST'];
    const organicColumns = ['N', 'P', 'K', 'PH', 'SOM'];
    const indexColumns = droughtColumns;  // Only drought columns
    const availableColumns = indexColumns.filter(col => col in data[0]);
    
    // Add coordinate columns (longitude, latitude) if available
    if ('longitude' in data[0] && 'latitude' in data[0]) {
        // Insert coordinates at the beginning
        availableColumns.unshift('latitude', 'longitude');
    }
    
    // Add prediction label column if prediction has been run
    if (hasPrediction) {
        if ('DROUGHT' in data[0]) {
            availableColumns.push('DROUGHT');
        } else if ('SOIL_TYPE' in data[0]) {
            availableColumns.push('SOIL_TYPE');
        }
    }
    
    // Build table HTML
    let tableHTML = '<table class="preview-table">';
    tableHTML += '<thead><tr>';
    availableColumns.forEach(col => {
        tableHTML += `<th>${getDisplayName(col)}</th>`;
    });
    tableHTML += '</tr></thead><tbody>';
    
    data.forEach(row => {
        tableHTML += '<tr>';
        availableColumns.forEach(col => {
            const value = row[col];
            let formatted;
            
            // Format based on column type
            if (typeof value === 'number') {
                // Use appropriate decimal precision
                if (col === 'longitude' || col === 'latitude') {
                    formatted = value.toFixed(6); // 6 decimals for coordinates
                } else if (col === 'LST') {
                    formatted = value.toFixed(2); // 2 decimals for temperature
                } else {
                    formatted = value.toFixed(4); // 4 decimals for indices
                }
            } else {
                formatted = value;
            }
            
            // Add color styling for DROUGHT column
            if (col === 'DROUGHT') {
                let colorClass = '';
                if (value === 'low drought') colorClass = 'drought-low';
                else if (value === 'medium drought') colorClass = 'drought-medium';
                else if (value === 'high drought') colorClass = 'drought-high';
                tableHTML += `<td class="${colorClass}">${formatted}</td>`;
            } else if (col === 'SOIL_TYPE') {
                let colorClass = '';
                if (value === 'Non-Organic') colorClass = 'soil-non-organic';
                else if (value === 'Organic') colorClass = 'soil-organic';
                tableHTML += `<td class="${colorClass}">${formatted}</td>`;
            } else {
                tableHTML += `<td>${formatted}</td>`;
            }
        });
        tableHTML += '</tr>';
    });
    
    tableHTML += '</tbody></table>';
    
    // Remove existing table before adding new one
    const existingTable = tablePreview.querySelector('.preview-table');
    if (existingTable) existingTable.remove();
    
    // Insert new table after placeholder (not replacing entire innerHTML)
    tablePreview.insertAdjacentHTML('beforeend', tableHTML);
    
    // Update info
    if (tableInfo) tableInfo.classList.remove('hidden');
    if (tableRowCount) tableRowCount.textContent = `${data.length} rows`;
}

// ============================================================================
// STATISTICAL CALCULATIONS
// ============================================================================
/**
 * Calculates basic statistics for a given column
 * @param {Array} data - Array of data objects
 * @param {string} columnName - Name of column to calculate stats for
 * @returns {Object} Statistics object with mean, std, min, max
 */
function calculateStats(data, columnName) {
    if (!data || data.length === 0) {
        return { mean: 0, std: 0, min: 0, max: 0 };
    }
    
    const values = data.map(row => row[columnName]).filter(v => typeof v === 'number' && !isNaN(v));
    
    if (values.length === 0) {
        return { mean: 0, std: 0, min: 0, max: 0 };
    }
    
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
    const std = Math.sqrt(variance);
    const min = Math.min(...values);
    const max = Math.max(...values);
    
    return { mean, std, min, max };
}

// ============================================================================
// CHART VISUALIZATION - DISTRIBUTION HISTOGRAM
// ============================================================================
/**
 * Creates histogram chart with distribution of selected index values
 * @param {string} indexName - Name of index to visualize (NDVI, NDWI, etc.)
 */
function updateDistributionChart(indexName) {
    if (!extractedData || extractedData.length === 0) {
        return;
    }
    
    const canvas = document.getElementById('distributionChart');
    if (!canvas || typeof Chart === 'undefined') {
        return;
    }
    
    // Get values for selected index
    const values = extractedData
        .map(row => row[indexName])
        .filter(v => typeof v === 'number' && !isNaN(v));
    
    if (values.length === 0) {
        return;
    }
    
    // Calculate statistics
    const stats = calculateStats(extractedData, indexName);
    updateStatsDisplayNormal(stats);
    
    // Create histogram bins
    const binCount = 20;
    const min = stats.min;
    const max = stats.max;
    const binWidth = (max - min) / binCount;
    
    const bins = Array(binCount).fill(0);
    const binLabels = [];
    
    for (let i = 0; i < binCount; i++) {
        const binStart = min + i * binWidth;
        const binEnd = binStart + binWidth;
        binLabels.push(binStart.toFixed(3));
        
        // Count values in this bin
        values.forEach(v => {
            if (v >= binStart && (i === binCount - 1 ? v <= binEnd : v < binEnd)) {
                bins[i]++;
            }
        });
    }
    
    // Destroy existing chart
    if (distributionChart) {
        distributionChart.destroy();
    }
    
    // Create new chart
    const ctx = canvas.getContext('2d');
    const isDark = !document.documentElement.hasAttribute('data-theme') || document.documentElement.getAttribute('data-theme') === 'dark';
    const labelColor = isDark ? '#94a9c4' : '#4a5f59';
    const gridColor = isDark ? 'rgba(148, 169, 196, 0.1)' : 'rgba(33, 191, 115, 0.1)';
    const barBgColor = isDark ? 'rgba(37, 99, 235, 0.6)' : 'rgba(33, 191, 115, 0.6)';
    const barBorderColor = isDark ? 'rgba(37, 99, 235, 1)' : 'rgba(33, 191, 115, 1)';
    const tooltipBg = isDark ? 'rgba(8, 18, 38, 0.95)' : 'rgba(255, 255, 255, 0.95)';
    const tooltipTitleColor = isDark ? '#f5f9ff' : '#1a2e29';
    const tooltipBodyColor = isDark ? '#94a9c4' : '#4a5f59';
    const tooltipBorderColor = isDark ? 'rgba(148, 169, 196, 0.3)' : 'rgba(33, 191, 115, 0.3)';
    
    distributionChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: binLabels,
            datasets: [{
                label: `${getDisplayName(indexName)} Distribution`,
                data: bins,
                backgroundColor: barBgColor,
                borderColor: barBorderColor,
                borderWidth: 1,
                borderRadius: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        color: labelColor,
                        font: { size: 11, weight: '600' }
                    }
                },
                tooltip: {
                    backgroundColor: tooltipBg,
                    titleColor: tooltipTitleColor,
                    bodyColor: tooltipBodyColor,
                    borderColor: tooltipBorderColor,
                    borderWidth: 1,
                    padding: 12,
                    displayColors: false,
                    callbacks: {
                        title: (items) => {
                            const binStart = parseFloat(items[0].label);
                            const binEnd = binStart + binWidth;
                            return `Range: ${binStart.toFixed(3)} - ${binEnd.toFixed(3)}`;
                        },
                        label: (item) => `Frequency: ${item.parsed.y}`
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: indexName,
                        color: labelColor,
                        font: { size: 11, weight: '600' }
                    },
                    ticks: {
                        color: labelColor,
                        font: { size: 9 },
                        maxRotation: 45,
                        minRotation: 45
                    },
                    grid: {
                        color: gridColor,
                        drawBorder: false
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Frequency',
                        color: labelColor,
                        font: { size: 11, weight: '600' }
                    },
                    ticks: {
                        color: labelColor,
                        font: { size: 9 }
                    },
                    grid: {
                        color: gridColor,
                        drawBorder: false
                    },
                    beginAtZero: true
                }
            }
        }
    });
}

// ============================================================================
// ANALYSIS SECTION INITIALIZATION
// ============================================================================
/**
 * Initializes analysis section after data extraction
 * Shows index buttons, chart, and statistics
 */
function initializeAnalysisSection() {
    const analysisSection = document.getElementById('analysis-section');
    const buttonsPlaceholder = document.getElementById('buttons-placeholder');
    const chartPlaceholder = document.getElementById('chart-placeholder');
    const statsPlaceholder = document.getElementById('stats-placeholder');
    const indexButtonsContainer = document.getElementById('index-buttons');
    const indexButtons = document.querySelectorAll('.index-btn:not(.dataviz-btn)');  // Original HTML buttons only
    const canvas = document.getElementById('distributionChart');
    const statItems = document.querySelectorAll('.stat-item');
    
    // Remove dataviz dynamic buttons when switching projects
    const datavizBtns = indexButtonsContainer?.querySelectorAll('.dataviz-btn');
    datavizBtns?.forEach(btn => btn.remove());
    
    // Determine if we have data for drought analysis
    const hasData = extractedData && extractedData.length > 0;
    
    if (!hasData) {
        // Show placeholders
        if (buttonsPlaceholder) buttonsPlaceholder.classList.remove('hidden');
        if (chartPlaceholder) chartPlaceholder.classList.remove('hidden');
        if (statsPlaceholder) statsPlaceholder.classList.remove('hidden');
        
        // Hide actual content (original buttons)
        indexButtons.forEach(btn => btn.classList.add('hidden'));
        if (canvas) canvas.classList.add('hidden');
        statItems.forEach(item => item.classList.add('hidden'));
        
        return;
    }
    
    // For dataviz project, use renderDataVizCharts instead
    // Hide placeholders and show content for drought analysis
    if (buttonsPlaceholder) buttonsPlaceholder.classList.add('hidden');
    if (chartPlaceholder) chartPlaceholder.classList.add('hidden');
    if (statsPlaceholder) statsPlaceholder.classList.add('hidden');
    
    // Show actual content - only drought indices
    const droughtIndices = ['NDVI', 'NDWI', 'NDDI', 'EVI', 'LST'];
    const organicIndices = ['N', 'P', 'K', 'PH', 'SOM'];
    const projectIndices = droughtIndices;  // Only drought indices
    
    indexButtons.forEach(btn => {
        const btnIndex = btn.dataset.index;
        // Show DROUGHT button only for drought project with prediction
        if (btnIndex === 'DROUGHT' && currentProject === 'drought' && hasPrediction) {
            btn.classList.remove('hidden');
        }
        // Show PREDICTION button only for organic project with prediction
        else if (btnIndex === 'PREDICTION' && currentProject === 'organic' && hasPrediction) {
            btn.classList.remove('hidden');
        }
        // Show project-specific index buttons if data exists
        else if (projectIndices.includes(btnIndex)) {
            // Check if this column exists in the extracted data
            if (btnIndex in extractedData[0]) {
                btn.classList.remove('hidden');
            } else {
                btn.classList.add('hidden');
            }
        }
        // Hide all other buttons
        else {
            btn.classList.add('hidden');
        }
    });
    if (canvas) canvas.classList.remove('hidden');
    statItems.forEach(item => item.classList.remove('hidden'));
    
    // Set first visible button as active (exclude dataviz buttons)
    const allOriginalButtons = document.querySelectorAll('.index-btn:not(.dataviz-btn)');
    const firstVisibleBtn = Array.from(allOriginalButtons).find(btn => !btn.classList.contains('hidden'));
    if (firstVisibleBtn) {
        allOriginalButtons.forEach(b => b.classList.remove('active'));
        firstVisibleBtn.classList.add('active');
        currentSelectedIndex = firstVisibleBtn.dataset.index;
    }
    
    // Render table preview
    renderTablePreview(extractedData);
    
    // Update distribution chart for current selected index
    updateDistributionChart(currentSelectedIndex);
}

// ============================================================================
// CHART VISUALIZATION - DROUGHT PIE CHART
// ============================================================================
/**
 * Creates pie chart showing drought level distribution
 * Only available after prediction has been run
 */
function updateDroughtChart() {
    if (!hasPrediction || !predictionData || predictionData.length === 0) {
        updateLog('No prediction data - run prediction first');
        return;
    }
    
    const canvas = document.getElementById('distributionChart');
    if (!canvas || typeof Chart === 'undefined') {
        return;
    }
    
    // Count drought classes
    const droughtCounts = {
        'Low Drought': 0,
        'Medium Drought': 0,
        'High Drought': 0
    };
    
    predictionData.forEach(row => {
        const droughtLevel = row['DROUGHT'];
        if (droughtLevel && droughtCounts.hasOwnProperty(droughtLevel)) {
            droughtCounts[droughtLevel]++;
        }
    });
    
    // Prepare data for pie chart
    const labels = Object.keys(droughtCounts);
    const values = Object.values(droughtCounts);
    const colors = ['#16a34a', '#f59e0b', '#ef4444']; // Green, Yellow, Red
    
    // Update statistics display with class counts
    document.getElementById('stat-mean').parentElement.querySelector('.stat-label').textContent = 'Low:';
    document.getElementById('stat-mean').textContent = droughtCounts['Low Drought'];
    
    document.getElementById('stat-std').parentElement.querySelector('.stat-label').textContent = 'Medium:';
    document.getElementById('stat-std').textContent = droughtCounts['Medium Drought'];
    
    document.getElementById('stat-min').parentElement.querySelector('.stat-label').textContent = 'High:';
    document.getElementById('stat-min').textContent = droughtCounts['High Drought'];
    
    document.getElementById('stat-max').parentElement.querySelector('.stat-label').textContent = 'Total:';
    document.getElementById('stat-max').textContent = predictionData.length;
    
    // Destroy existing chart
    if (distributionChart) {
        distributionChart.destroy();
        distributionChart = null;
    }
    
    // Create pie chart with professional styling
    const ctx = canvas.getContext('2d');
    const isDark = !document.documentElement.hasAttribute('data-theme') || document.documentElement.getAttribute('data-theme') === 'dark';
    const labelColor = isDark ? '#f5f9ff' : '#1a2e29';
    const tooltipBg = isDark ? 'rgba(8, 18, 38, 0.95)' : 'rgba(255, 255, 255, 0.98)';
    const tooltipTitleColor = isDark ? '#f5f9ff' : '#1a2e29';
    const tooltipBodyColor = isDark ? '#94a9c4' : '#4a5f59';
    const tooltipBorderColor = isDark ? 'rgba(148, 169, 196, 0.3)' : 'rgba(10, 175, 107, 0.25)';
    
    distributionChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: colors,
                borderWidth: 0,
                hoverBorderWidth: 0,
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: {
                        color: labelColor,
                        font: { size: 12, weight: '600' },
                        padding: 15,
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                },
                tooltip: {
                    backgroundColor: tooltipBg,
                    titleColor: tooltipTitleColor,
                    bodyColor: tooltipBodyColor,
                    borderColor: tooltipBorderColor,
                    borderWidth: 1,
                    padding: 12,
                    displayColors: true,
                    callbacks: {
                        label: (context) => {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((value / total) * 100).toFixed(1);
                            return `${label}: ${value} (${percentage}%)`;
                        }
                    }
                },
                title: {
                    display: true,
                    text: 'Drought Level Distribution',
                    color: labelColor,
                    font: { size: 14, weight: '600' },
                    padding: { top: 10, bottom: 15 }
                }
            }
        }
    });
}

// ============================================================================
// CHART VISUALIZATION - ORGANIC PIE CHART
// ============================================================================
/**
 * Creates pie chart showing organic/non-organic distribution
 * Only available after prediction has been run
 */
function updateOrganicChart() {
    if (!hasPrediction || !predictionData || predictionData.length === 0) {
        updateLog('No soil classification data - run prediction first');
        return;
    }
    
    const canvas = document.getElementById('distributionChart');
    if (!canvas || typeof Chart === 'undefined') {
        return;
    }
    
    // Count organic classes
    const organicCounts = {
        'Non-Organic': 0,
        'Organic': 0
    };
    
    predictionData.forEach(row => {
        const prediction = row['prediction'];
        if (prediction === 0) {
            organicCounts['Non-Organic']++;
        } else if (prediction === 1) {
            organicCounts['Organic']++;
        }
    });
    
    // Prepare data for pie chart
    const labels = Object.keys(organicCounts);
    const values = Object.values(organicCounts);
    const colors = ['#a9a9a9', '#228b22']; // Gray for Non-Organic, Green for Organic (match map layer)
    
    // Update statistics display with class counts
    document.getElementById('stat-mean').parentElement.querySelector('.stat-label').textContent = 'Non-Organic:';
    document.getElementById('stat-mean').textContent = organicCounts['Non-Organic'];
    
    document.getElementById('stat-std').parentElement.querySelector('.stat-label').textContent = 'Organic:';
    document.getElementById('stat-std').textContent = organicCounts['Organic'];
    
    document.getElementById('stat-min').parentElement.querySelector('.stat-label').textContent = 'Total:';
    document.getElementById('stat-min').textContent = predictionData.length;
    
    document.getElementById('stat-max').parentElement.querySelector('.stat-label').textContent = 'Organic %:';
    const organicPercent = ((organicCounts['Organic'] / predictionData.length) * 100).toFixed(1);
    document.getElementById('stat-max').textContent = organicPercent + '%';
    
    // Destroy existing chart
    if (distributionChart) {
        distributionChart.destroy();
        distributionChart = null;
    }
    
    // Create pie chart with professional styling
    const ctx = canvas.getContext('2d');
    const isDark = !document.documentElement.hasAttribute('data-theme') || document.documentElement.getAttribute('data-theme') === 'dark';
    const labelColor = isDark ? '#f5f9ff' : '#1a2e29';
    const tooltipBg = isDark ? 'rgba(8, 18, 38, 0.95)' : 'rgba(255, 255, 255, 0.98)';
    const tooltipTitleColor = isDark ? '#f5f9ff' : '#1a2e29';
    const tooltipBodyColor = isDark ? '#94a9c4' : '#4a5f59';
    const tooltipBorderColor = isDark ? 'rgba(148, 169, 196, 0.3)' : 'rgba(10, 175, 107, 0.25)';
    
    const chartConfig = {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: colors,
                borderColor: isDark ? '#081226' : '#ffffff',
                borderWidth: 2,
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: labelColor,
                        padding: 15,
                        font: { size: 12, weight: '500' },
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                },
                tooltip: {
                    backgroundColor: tooltipBg,
                    titleColor: tooltipTitleColor,
                    bodyColor: tooltipBodyColor,
                    borderColor: tooltipBorderColor,
                    borderWidth: 1,
                    padding: 12,
                    displayColors: true,
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((value / total) * 100).toFixed(1);
                            return ` ${label}: ${value} (${percentage}%)`;
                        }
                    }
                },
                title: {
                    display: true,
                    text: 'Organic Land Distribution',
                    color: labelColor,
                    font: { size: 14, weight: '600' },
                    padding: { top: 10, bottom: 15 }
                }
            }
        }
    };
    
    distributionChart = new Chart(ctx, chartConfig);
}

// ============================================================================
// STATISTICS DISPLAY UPDATE
// ============================================================================
/**
 * Updates statistics display with normal statistical values
 * @param {Object} stats - Statistics object with mean, std, min, max
 */
function updateStatsDisplayNormal(stats) {
    document.getElementById('stat-mean').parentElement.querySelector('.stat-label').textContent = 'Mean:';
    document.getElementById('stat-mean').textContent = stats.mean.toFixed(4);
    
    document.getElementById('stat-std').parentElement.querySelector('.stat-label').textContent = 'Std Dev:';
    document.getElementById('stat-std').textContent = stats.std.toFixed(4);
    
    document.getElementById('stat-min').parentElement.querySelector('.stat-label').textContent = 'Min:';
    document.getElementById('stat-min').textContent = stats.min.toFixed(4);
    
    document.getElementById('stat-max').parentElement.querySelector('.stat-label').textContent = 'Max:';
    document.getElementById('stat-max').textContent = stats.max.toFixed(4);
}

// ============================================================================
// PROJECT SELECTION & UI MANAGEMENT
// ============================================================================
/**
 * Updates UI elements based on current project selection
 */
function updateProjectUI() {
    const titleElement = document.querySelector('.header-title__sub');
    if (currentProject === 'drought') {
        if (titleElement) titleElement.textContent = 'Drought Classification Analysis';
    } else if (currentProject === 'organic') {
        if (titleElement) titleElement.textContent = 'Soil Classification Analysis';
    } else if (currentProject === 'dataviz') {
        if (titleElement) titleElement.textContent = 'Fertilization Monitoring';
    }
    
    const projectName = currentProject === 'drought' ? 'Drought Monitoring System' : 
                        currentProject === 'organic' ? 'Soil Classification System' : 
                        'Fertilization Monitoring';
    updateLog(`Switched to ${projectName} - Ready for analysis`);
    
    // Toggle visibility of project-specific LEFT sidebar sections only
    const datavizSections = document.querySelectorAll('.sidebar-left .dataviz-section');
    const regularSections = document.querySelectorAll('.sidebar-left .sidebar-card:not(.dataviz-section):not(#help-section)');
    
    // Get help scroll element
    const helpScroll = document.getElementById('help-section-scroll');
    
    if (currentProject === 'dataviz') {
        datavizSections.forEach(section => section.style.display = 'block');
        regularSections.forEach(section => section.style.display = 'none');
        
        // Set height for help section in fertilization monitoring project (580px)
        if (helpScroll) {
            helpScroll.classList.add('dataviz-mode');
        }
    } else {
        datavizSections.forEach(section => section.style.display = 'none');
        regularSections.forEach(section => section.style.display = 'block');
        
        // Set height for help section in drought/soil classification projects (188px)
        if (helpScroll) {
            helpScroll.classList.remove('dataviz-mode');
        }
    }
    
    // Ensure right sidebar is always visible (never hide it)
    const rightSidebar = document.querySelector('.sidebar-right');
    if (rightSidebar) {
        rightSidebar.style.display = '';
    }
    
    // Update help section content for current project
    updateHelpSection();
}
