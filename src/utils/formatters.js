/**
 * Formatting utilities for displaying data in Telegram messages
 */

/**
 * Format project name with Google Sheets link if available
 * @param {Object} project - Project object
 * @returns {string} Formatted project name with optional link
 */
function formatProjectName(project) {
  if (project.google_sheet_url) {
    return `[${project.name}](${project.google_sheet_url})`;
  }
  return project.name;
}

/**
 * Format project name for display in confirmation messages
 * @param {Object} project - Project object
 * @returns {string} Formatted project line
 */
function formatProjectLine(project) {
  if (project.google_sheet_url) {
    return `📋 Проект: [${project.name}](${project.google_sheet_url})`;
  }
  return `📋 Проект: ${project.name}`;
}

module.exports = {
  formatProjectName,
  formatProjectLine
};