# ghost-publish-action

A GitHub Action to publish markdown files from a commit to Ghost as a post draft.

**Warning:** This software is work in progress and might break your website or kill the internet. Use at your own risk.

## Working

- This action expects 1 markdown file in a commit. It also expects a corresponding JSON file for the metadata configuration with at least the title field specified.
- It will parse the markdown for images, upload the images to Ghost and replace the URLs with the URLs returned by Ghost.
- Then it converts the Markdown to HTML using markdown-it and submists the post to Ghost as a draft using the metadata from the JSON file.

## How to use it

- Create a Workflow in your blog repository
- Copy this flow

```yaml
name: Publish Markdown to Ghost

on:
  push:
    branches:
      - main
    paths:
      - '**/*.md'
      - '**/*.json'

jobs:
  publish-to-ghost:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout Repo
        uses: actions/checkout@v4
        with:
          fetch-depth: 3

      - name: Use Ghost Publish Action
        uses: dragonscale-ai/ghost-publish-action@main
        with:
          ghost_api_url: ${{ secrets.GHOST_API_URL }}
          ghost_admin_api_key: ${{ secrets.GHOST_ADMIN_API_KEY }}
```

- Add `GHOST_API_URL` and `GHOST_ADMIN_API_KEY` as repository secrets.
- Publish your blog post markdown `<some-name>.md` and the metadata JSON `<some-name>.json` to the repo. Note the filenames of the markdown and json should be the same.
- Note: Do not have Heading 1 in your markdown file. This will be taken from the title in the JSON.
- Note: These are the fields you can have in the JSON [(source)](https://ghost.org/docs/admin-api/#the-post-object)

```json
{
  "title": "Your Post Title",
  "authors": ["Author Name"],
  "tags": ["Tag1", "Tag2"],
  "feature_image": "path/to/image",
  "feature_image_alt": "Some alt text",
  "custom_excerpt": "A brief excerpt",
  "featured": false,
  "meta_title": "Meta Title for SEO",
  "meta_description": "Meta Description for SEO",
  "og_image": "URL of Open Graph image",
  "og_title": "Open Graph Title",
  "og_description": "Open Graph Description",
  "twitter_image": "URL of Twitter image",
  "twitter_title": "Twitter Title",
  "twitter_description": "Twitter Description"
}
```

## TODO List

- [X] Setup proper build process instead on installing packages from index.js as documented here - <https://docs.github.com/en/actions/creating-actions/creating-a-javascript-action#commit-tag-and-push-your-action-to-github>
- [X] Add all the important metadata to action.yml
- [X] Add Apache License
- [ ] Make the code more robust and handle errors better
  - [ ] Handle multiple markdown files in a single commit
  - [ ] Handle invalid metadata JSON and report errors
  - [ ] Report error if JSON doesn't have title field
  - [ ] Report error on missing images
- [ ] Feature: Handle posting Gists
