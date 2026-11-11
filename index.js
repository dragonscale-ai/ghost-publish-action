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

    const markdownFiles = getChangedMarkdownFiles();

    if (markdownFiles.length === 0) {
        console.log("No markdown posts in HEAD commit");
        process.exit(0);
    }

    console.log(`Found ${markdownFiles.length} post(s):`, markdownFiles);

    const failed = [];
    for (const markdownFile of markdownFiles) {
        try {
            await publishPost(api, fs, markdownFile);
        } catch (error) {
            console.error(`Failed to create post for ${markdownFile}:`, error);
            failed.push(markdownFile);
        }
    }

    if (failed.length > 0) {
        console.error(`${failed.length} of ${markdownFiles.length} post(s) failed:`, failed);
        process.exit(1);
    }
}

/**
 * Create a Ghost draft from one Markdown file and its sibling JSON metadata file
 */
async function publishPost(api, fs, markdownFile) {
    const markdownFileDir = markdownFile.substring(0, markdownFile.lastIndexOf('/'));

    let markdownContent = fs.readFileSync(markdownFile, 'utf8');

    // Upload images and update Markdown content
    markdownContent = await uploadImagesAndReplaceUrls(api, markdownContent, markdownFileDir);

    const htmlContent = convertMarkdownToHTML(markdownContent);
    const jsonMetadataFile = markdownFile.replace(/\.md$/, '.json');
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
}

/**
 * Markdown files added or modified in the HEAD commit that have a sibling
 * JSON metadata file (so README.md and similar files are skipped)
 */
function getChangedMarkdownFiles() {
    const fs = require('fs');
    return getChangedFiles()
        .filter(file => file.endsWith('.md'))
        .filter(file => {
            const hasMetadata = fs.existsSync(file.replace(/\.md$/, '.json'));
            if (!hasMetadata) console.log(`Skipping ${file}: no matching .json metadata file`);
            return hasMetadata;
        });
}

/**
 * List the files added or modified in the HEAD commit
 * @returns {string[]} - Paths relative to the repository root
 */
function getChangedFiles() {
    console.log('Git Version:', execSync('git --version').toString().trim());
    console.log("Git log:\n", execSync('git log --oneline -n 5').toString());

    const command = 'git diff-tree --no-commit-id --name-only -r --diff-filter=AM HEAD';
    console.log('Executing command:', command);
    return execSync(command).toString().split('\n').map(line => line.trim()).filter(Boolean);
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
            throw new Error(`Error uploading image ${imageAbsolutePath}: ${error.message}`);
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
            throw new Error(`Error uploading feature image ${featureImagePath}: ${error.message}`);
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
