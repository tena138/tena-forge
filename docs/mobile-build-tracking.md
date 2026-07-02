# Mobile Build Tracking

This file records the exact source state used for TestFlight builds so fixes from
multiple chats can be compared against the build installed on devices.

## Tena Note iOS 1.0.0 (2)

- App: Tena Note
- Platform: iOS TestFlight
- Bundle ID: `com.tenaforge.tenanote`
- Version: `1.0.0`
- Build number: `2`
- Source commit: `8e421baeb2a920299d814bb5af5054b73ca4d91e`
- Expected tag: `tena-note-ios-1.0.0-build.2`
- App Store Connect status: uploaded and installed by internal tester
- Internal group: `me`

### Included Change Window

These commits are visible in the source history leading into build 2:

- `8e421bae` Adapt note navigation for phones
- `636c11fc` Add share export popover
- `bfa1f501` Add note editor search panel
- `802e1bc5` Add photo insertion to notes
- `2ade8544` Fix note editor stylus tools
- `6d809729` Fix Tena Note notebook interactions
- `340230d7` Fix mobile OAuth callback and submission badges
- `247d2acb` Improve mobile pencil drawing and iOS pods

Build 1 was not tagged in this repo, so treat the list above as the practical
build 2 tracking window rather than a mathematically exact build 1 to build 2
diff.

### iPad Test Focus

- Apple Pencil drawing smoothness in the note editor
- Tool switching between pointer, pen, highlighter, eraser, and lasso
- Note navigation on iPad and phone-sized layouts
- Notebook interactions and note creation
- Photo insertion into notes
- Search panel behavior inside the note editor
- Share/export popover behavior
- Login and OAuth callback flow
- Test-taking and submission badge flow

### Tracking Rules

- Every TestFlight upload must have a unique build number.
- After upload, tag the exact commit used for the archive.
- Record the tag, commit, build number, and test findings in this file.
- Before another chat pushes to `main`, it should pull latest `origin/main`.
- Never force-push `main`; if histories diverge, rebase or merge deliberately.

