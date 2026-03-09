/**
 * Chart Generator Service
 * Generates embedded chart images for PDF summaries using Chart.js
 */

const { ChartJSNodeCanvas } = require('chartjs-node-canvas');

// Chart configuration
const chartConfig = {
    width: 550,
    height: 180,
    backgroundColour: '#0F172A' // Match dashboard dark theme
};

const chartJSNodeCanvas = new ChartJSNodeCanvas(chartConfig);

// Common chart styling to match dashboard
const commonOptions = {
    responsive: false,
    animation: false,
    plugins: {
        legend: {
            display: false
        }
    },
    scales: {
        x: {
            grid: { color: '#334155' },
            ticks: { color: '#94A3B8', font: { size: 10 } }
        },
        y: {
            grid: { color: '#334155' },
            ticks: { color: '#94A3B8', font: { size: 10 } }
        }
    }
};

/**
 * Generate adherence trend line chart
 * @param {Array} dailyData - Array of { date, adherencePercent }
 * @returns {Promise<string>} Base64 data URL
 */
const generateAdherenceChart = async (dailyData) => {
    const labels = dailyData.map(d => d.date);
    const values = dailyData.map(d => d.adherencePercent);

    const configuration = {
        type: 'line',
        data: {
            labels,
            datasets: [{
                data: values,
                borderColor: '#22C55E',
                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                fill: true,
                tension: 0.3,
                pointRadius: 2,
                pointBackgroundColor: '#22C55E'
            }]
        },
        options: {
            ...commonOptions,
            scales: {
                ...commonOptions.scales,
                y: {
                    ...commonOptions.scales.y,
                    min: 0,
                    max: 100,
                    title: { display: true, text: '%', color: '#94A3B8' }
                }
            }
        }
    };

    return chartJSNodeCanvas.renderToDataURL(configuration);
};

/**
 * Generate glucose trend chart with threshold bands
 * @param {Array} vitalsData - Array of { date, glucose }
 * @returns {Promise<string>} Base64 data URL
 */
const generateGlucoseChart = async (vitalsData) => {
    const labels = vitalsData.map(d => d.date);
    const values = vitalsData.map(d => d.glucose);

    // Only include if we have data
    if (values.every(v => v === null)) {
        return null;
    }

    const configuration = {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Glucose',
                    data: values,
                    borderColor: '#3B82F6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    fill: false,
                    tension: 0.3,
                    pointRadius: 3,
                    pointBackgroundColor: '#3B82F6'
                },
                {
                    label: 'Target Upper',
                    data: Array(labels.length).fill(140),
                    borderColor: '#22C55E',
                    borderDash: [5, 5],
                    fill: false,
                    pointRadius: 0
                },
                {
                    label: 'Target Lower',
                    data: Array(labels.length).fill(70),
                    borderColor: '#F59E0B',
                    borderDash: [5, 5],
                    fill: false,
                    pointRadius: 0
                }
            ]
        },
        options: {
            ...commonOptions,
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: { color: '#94A3B8', boxWidth: 12, font: { size: 10 } }
                }
            },
            scales: {
                ...commonOptions.scales,
                y: {
                    ...commonOptions.scales.y,
                    title: { display: true, text: 'mg/dL', color: '#94A3B8' }
                }
            }
        }
    };

    return chartJSNodeCanvas.renderToDataURL(configuration);
};

/**
 * Generate engagement bar chart
 * @param {Array} dailyData - Array of { date, responded }
 * @returns {Promise<string>} Base64 data URL
 */
const generateEngagementChart = async (dailyData) => {
    const labels = dailyData.map(d => d.date);
    const values = dailyData.map(d => d.responded ? 1 : 0);

    const configuration = {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: values.map(v => v ? '#22C55E' : '#475569'),
                borderRadius: 2
            }]
        },
        options: {
            ...commonOptions,
            scales: {
                ...commonOptions.scales,
                y: {
                    display: false,
                    min: 0,
                    max: 1
                }
            }
        }
    };

    return chartJSNodeCanvas.renderToDataURL(configuration);
};

/**
 * Generate all charts for a patient summary
 * @param {Object} data - Aggregated patient data
 * @param {number} timeRangeDays - Time range in days
 * @returns {Promise<Object>} Object with chart data URLs
 */
const generateCharts = async (data, timeRangeDays) => {
    try {
        const adherenceChart = await generateAdherenceChart(data.dailyAdherence || []);
        const glucoseChart = await generateGlucoseChart(data.dailyVitals || []);
        const engagementChart = await generateEngagementChart(data.dailyEngagement || []);

        return {
            adherenceChart,
            glucoseChart,
            engagementChart
        };
    } catch (error) {
        console.error('Chart generation error:', error);
        // Return null charts rather than failing completely
        return {
            adherenceChart: null,
            glucoseChart: null,
            engagementChart: null
        };
    }
};

module.exports = {
    generateCharts,
    generateAdherenceChart,
    generateGlucoseChart,
    generateEngagementChart
};
