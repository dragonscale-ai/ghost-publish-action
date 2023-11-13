const GhostAdminAPI = require('@tryghost/admin-api');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

// Initialize the Ghost Admin API client
const api = new GhostAdminAPI({
    url: process.env.GHOST_API_URL,
    key: process.env.GHOST_ADMIN_API_KEY,
    version: 'v3'
});

/**
 * Main function for the action
 */
async function main() {
    try {
        const latestMdFile = getLatestFile('.md');
        let markdownContent = fs.readFileSync(latestMdFile, 'utf8');
        
        // Upload images and update Markdown content
        markdownContent = await uploadImagesAndReplaceUrls(markdownContent);

        const htmlContent = convertMarkdownToHTML(markdownContent); // Implement this function
        const jsonMetadataFile = latestMdFile.replace('.md', '.json');
        const metadata = JSON.parse(fs.readFileSync(jsonMetadataFile, 'utf8'));

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
 * Get the latest file with a specific extension from the last commit
 */
function getLatestFile(extension) {
    try {
        const command = `git diff --name-only HEAD HEAD~1 | grep '\.${extension}$'`;
        const latestFile = execSync(command).toString().trim();
        return latestFile;
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
async function uploadImagesAndReplaceUrls(markdownContent) {
    let updatedMarkdownContent = markdownContent;
    const imagePaths = extractImagePaths(markdownContent);

    for (let imagePath of imagePaths) {
        try {
            const uploadedImageUrl = await uploadImageToGhost(imagePath);
            updatedMarkdownContent = updatedMarkdownContent.replace(imagePath, uploadedImageUrl);
        } catch (error) {
            console.error('Error uploading image:', error);
        }
    }

    return updatedMarkdownContent;
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
 * Upload an image file to Ghost and return the uploaded image URL
 */
async function uploadImageToGhost(imagePath) {
    const formData = new FormData();
    formData.append('file', fs.createReadStream(imagePath));
    formData.append('purpose', 'image');

    try {
        const uploadedImage = await api.images.upload({file: formData});
        return uploadedImage.url;
    } catch (error) {
        console.error('Error uploading image to Ghost:', error);
        throw error;
    }
}

main();
