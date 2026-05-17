# Publishing Guide for ChangeNarator

This document contains the complete checklist and instructions for publishing ChangeNarator to npm.

## ✅ Pre-Publish Checklist (COMPLETED)

All preparation steps have been completed:

- [x] Removed "private": true from package.json
- [x] Added comprehensive package metadata (description, keywords, author, license, repository, homepage, bugs)
- [x] Verified package name "changenarrator" is available on npm
- [x] Configured "files" field to include only necessary files (dist/, README.md, LICENSE)
- [x] Set version to 1.0.0 for initial release
- [x] Apache 2.0 LICENSE file present
- [x] Updated README.md with npm installation instructions and badges
- [x] All 51 tests passing
- [x] TypeScript type checking passes
- [x] Project built successfully (dist/ directory)
- [x] CLI tested and working (node dist/cli/index.js --help)
- [x] Package size verified: 71.1 kB (tarball), 341.2 kB (unpacked)
- [x] No hardcoded secrets in codebase
- [x] Dependencies reviewed (all well-known packages)
- [x] Dry-run successful (npm publish --dry-run)

## 📦 Package Details

- **Name**: changenarrator
- **Version**: 1.0.0
- **License**: Apache-2.0
- **Size**: 71.1 kB (tarball), 341.2 kB (unpacked)
- **Files**: 5 (LICENSE, README.md, dist/cli/index.js, dist/index.js, package.json)
- **CLI Command**: changenarator
- **Node Version**: >= 20

## 🚀 Publishing Steps

### 1. Update Repository URL (REQUIRED)

Before publishing, update the placeholder repository URL in `package.json`:

```json
"repository": {
  "type": "git",
  "url": "git+https://github.com/YOUR_USERNAME/ChangeNarator.git"
},
"homepage": "https://github.com/YOUR_USERNAME/ChangeNarator#readme",
"bugs": {
  "url": "https://github.com/YOUR_USERNAME/ChangeNarator/issues"
}
```

Replace `YOUR_USERNAME` with your actual GitHub username.

### 2. Login to npm

```bash
npm login
```

You'll be prompted for:
- Username
- Password
- Email
- One-time password (if 2FA is enabled)

### 3. Final Build

Ensure the latest build is ready:

```bash
bun run build && bun run build:cli
```

### 4. Publish to npm

```bash
npm publish
```

This will:
- Create a tarball
- Upload to npm registry
- Make the package publicly available

### 5. Verify Publication

Check the package on npm:

```bash
npm view changenarrator
```

Or visit: https://www.npmjs.com/package/changenarrator

### 6. Test Installation

Test the global installation:

```bash
npm install -g changenarrator
changenarator --help
```

### 7. Create Git Tag

Tag the release in git:

```bash
git tag -a v1.0.0 -m "Release version 1.0.0"
git push origin v1.0.0
```

### 8. Create GitHub Release

1. Go to your repository on GitHub
2. Click "Releases" → "Create a new release"
3. Select tag: v1.0.0
4. Title: "v1.0.0 - Initial Release"
5. Description:
   ```markdown
   ## 🎉 Initial Release
   
   ChangeNarator is now available on npm!
   
   ### Installation
   ```bash
   npm install -g changenarrator
   ```
   
   ### Features
   - 🔍 Fetch PR metadata from GitHub
   - 🤖 AI-powered changelog generation using IBM WatsonX
   - 📝 Publish changelogs to Notion
   - 🎯 Generate changelogs for 3 audiences (developers, PMs, users)
   - ⚙️ Interactive CLI setup wizard
   
   ### What's Included
   - Complete CLI tool
   - Comprehensive documentation
   - 51 passing tests
   - TypeScript support
   
   For full documentation, see the [README](https://github.com/YOUR_USERNAME/ChangeNarator#readme)
   ```

## 📝 Post-Publish Checklist

After publishing:

- [ ] Verify package appears on npmjs.com
- [ ] Test `npm install -g changenarrator`
- [ ] Test `npx changenarrator init`
- [ ] Update any documentation with actual npm links
- [ ] Announce on social media (optional)
- [ ] Add npm version badge to README (will auto-update)

## 🔄 Future Updates

For subsequent releases:

1. Update version in package.json (follow semver):
   - Patch: 1.0.1 (bug fixes)
   - Minor: 1.1.0 (new features, backward compatible)
   - Major: 2.0.0 (breaking changes)

2. Update CHANGELOG.md with changes

3. Build and test:
   ```bash
   bun test
   bun run typecheck
   bun run build && bun run build:cli
   ```

4. Publish:
   ```bash
   npm publish
   git tag -a vX.Y.Z -m "Release version X.Y.Z"
   git push origin vX.Y.Z
   ```

## 🛠️ Troubleshooting

### "You do not have permission to publish"
- Ensure you're logged in: `npm whoami`
- Check package name isn't taken: `npm view changenarrator`

### "Package name too similar to existing package"
- Choose a different name in package.json

### "Version already exists"
- Increment version number in package.json

### Build errors
- Run `bun install` to ensure dependencies are up to date
- Check Node.js version: `node --version` (should be >= 20)

## 📊 Package Statistics

After publishing, monitor:
- Downloads: https://npm-stat.com/charts.html?package=changenarrator
- Bundle size: https://bundlephobia.com/package/changenarrator
- Dependencies: https://david-dm.org/YOUR_USERNAME/ChangeNarator

## 🔐 Security

- Never commit npm credentials
- Enable 2FA on npm account
- Use `npm audit` regularly (when using npm)
- Keep dependencies updated

## 📞 Support

If you encounter issues:
1. Check this guide
2. Review npm documentation: https://docs.npmjs.com/
3. Open an issue on GitHub

---

**Ready to publish?** Follow the steps above in order. Good luck! 🚀