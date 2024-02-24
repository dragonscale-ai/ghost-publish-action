/**
 *     Copyright [2023] [Dragonscale Industires Inc.]
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
const { execSync } = require('child_process');
const { log } = require('console');
const { exit } = require('process');

/**
 * Main function for the action
 */
async function main() {
    const GhostAdminAPI = require('@tryghost/admin-api');
    const fs = require('fs');

    // Initialize the Ghost Admin API client
    const api = new GhostAdminAPI({
        url: process.env.INPUT_GHOST_API_URL,
        key: process.env.INPUT_GHOST_ADMIN_API_KEY,
        version: 'v5.0'
    });

    try {
        const latestMdFile = getLatestFile('.md');

        if (latestMdFile == null | latestMdFile == "") {
            console.log("No markdown in HEAD commit");
            process.exit(0);
        }

        const markdownFileDir = latestMdFile.substring(0, latestMdFile.lastIndexOf('/'));

        let markdownContent = fs.readFileSync(latestMdFile, 'utf8');

        // Upload images and update Markdown content
        markdownContent = await uploadImagesAndReplaceUrls(api, markdownContent, markdownFileDir);

        const htmlContent = convertMarkdownToHTML(markdownContent); // Implement this function
        const jsonMetadataFile = latestMdFile.replace('.md', '.json');
        let metadata = JSON.parse(fs.readFileSync(jsonMetadataFile, 'utf8'));

        // Upload feature image and update metadata
        if (metadata.feature_image != null) {
            metadata = await uploadFeatureImageAndReplaceUrl(api, metadata, markdownFileDir);
        }

        // Create a new post in Ghost
        const response = await api.posts.add({
            ...metadata,
            html: htmlContent,
            status: 'draft'
        }, {
            source: 'html'
        });

        console.log('Post created:', response.url);
    } catch (error) {
        console.error('Failed to create post:', error);
        process.exit(1);
    }
}

/**
 * Returns a command string that can be used to retrieve the latest file with a specific extension from a Git repository.
 *
 * @param {string} filter - A filter used to specify the type of changes to include in the command.
 * @param {string} extension - The file extension to filter the results by.
 * @returns {string} - The command string.
 */
function getLatestFileCommand(extension) {
    return `git diff-tree --no-commit-id --name-only HEAD -r --diff-filter=AM | grep '${extension}'`;
}

/**
 * Executes a command to find the latest file with a specific extension in the Git repository.
 */
function executeLatestFileCommand(extension) {
    const command = getLatestFileCommand(extension);
    console.log('Executing command:', command); // Debug log
    return execSync(command).toString().trim();
}

/**
 * Get the latest file with a specific extension from the last commit
 * @param {string} extension - The file extension to search for
 * @returns {string|null} - The path of the latest file with the specified extension, or null if no file is found
 */
function getLatestFile(extension) {
    try {
        // Print the Git version
        console.log('Git Version:', execSync('git --version').toString().trim());

        // Print the current working directory
        console.log('Current working directory:', __dirname);

        // List the contents of the current directory
        console.log('Directory contents:', execSync('ls -la').toString());

        // Show git log
        console.log("Git log:\n", execSync('git log --oneline -n 5').toString());

        let latestFile = executeLatestFileCommand('A', extension);

        console.log('Found file:', latestFile); // Debug log
        return latestFile || null;
    } catch (error) {
        console.error('Error finding the latest file:', error);
        return null;
    }
}

/**
 * Convert Markdown content to HTML
 */
function convertMarkdownToHTML(markdown) {
    const MarkdownIt = require('markdown-it');
    const md = new MarkdownIt();
    return md.render(markdown);
}

/**
 * Upload images found in Markdown content to Ghost and replace local URLs
 */
async function uploadImagesAndReplaceUrls(api, markdownContent, markdownFileDir) {
    let updatedMarkdownContent = markdownContent;
    const imagePaths = extractImagePaths(markdownContent);

    for (let imagePath of imagePaths) {
        const imageAbsolutePath = getAbsolutePath(imagePath, markdownFileDir);
        try {
            const uploadedImageUrl = await uploadImageToGhost(api, imageAbsolutePath);
            updatedMarkdownContent = updatedMarkdownContent.replace(imagePath, uploadedImageUrl);
        } catch (error) {
            console.error('Error uploading image:', error);
            process.exit(1);
        }
    }

    return updatedMarkdownContent;
}

/**
 * Upload images found in Markdown content to Ghost and replace local URLs
 */
async function uploadFeatureImageAndReplaceUrl(api, metadata, markdownFileDir) {
    // Deep copy
    let updatedMetadata = JSON.parse(JSON.stringify(metadata));
    const maybeFeatureImagePath = updatedMetadata.feature_image;

    if (maybeFeatureImagePath) {
        const featureImagePath = getAbsolutePath(maybeFeatureImagePath, markdownFileDir);
        try {
            const uploadedImageUrl = await uploadImageToGhost(api, featureImagePath);
            updatedMetadata.feature_image = uploadedImageUrl;
        } catch (error) {
            console.error('Error uploading image:', error);
            process.exit(1);
        }
    }

    return updatedMetadata;
}

/**
 * Extract local image paths from Markdown content
 */
function extractImagePaths(markdownContent) {
    const regex = /!\[.*?\]\((.*?)\)/g;
    const paths = [];
    let match;

    while ((match = regex.exec(markdownContent)) !== null) {
        paths.push(match[1]);
    }

    return paths;
}

/**
 * If the image path is local, get absolute image path
 */
function getAbsolutePath(imagePath, markdownFileDirectory) {
    if (imagePath.startsWith('http')) {
        return imagePath;
    } else if (imagePath.startsWith('/') ) {
        return imagePath.slice(1);
    } else if (imagePath.startsWith('../')) {
        const regex = /^(\.\.\/)*/;
        const prefix = imagePath.match(regex)[0]
        const numOfDirectoriesUp = prefix.length / 3;
        const parentDirectory = markdownFileDirectory.split('/').slice(0, -numOfDirectoriesUp).join('/');
        const rest = imagePath.slice(prefix.length)
        return parentDirectory.length > 0 ? `${parentDirectory}/${rest}` : rest;
    } else {
        return `${markdownFileDirectory}/${imagePath}`;
    }
}

/**
 * Upload an image file to Ghost and return the uploaded image URL
 */
async function uploadImageToGhost(api, imagePath) {
    try {
        const uploadedImage = await api.images.upload({ file: imagePath });
        return uploadedImage.url;
    } catch (error) {
        console.error('Error uploading image to Ghost:', error);
        throw error;
    }
}

main();
