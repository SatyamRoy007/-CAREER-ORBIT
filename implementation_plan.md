# Implementation Plan: Multi-Resume Management & Resume Builder

## Goal
Implement a complete Multi-Resume management system (Add, Switch, Delete) and a built-in Resume Builder that generates `.docx` files based on `Resume_Template.docx`.

## User Review Required
[!IMPORTANT]
- **DOCX Generation Approach**: Since the provided `Resume_Template.docx` uses literal text (e.g., "FULL NAME", "insertemailidhere@gmail.com") instead of explicit template placeholders (like `{{FULL_NAME}}`), I will write a script to inject proper `docxtemplater` tags into the template before using it. Is this acceptable, or would you prefer I generate a `.docx` completely from scratch using the `docx` library to mimic the template?
- **Resume Builder UI**: The builder will include a modal form with sections for Personal Info, Skills, Experience (dynamic list), and Education.

## Open Questions
- Should the generated Resume automatically trigger an agent search, or just be set as the "active" resume for the user to review first?

## Proposed Changes

### 1. Multi-Resume Backend API (`server/index.mjs`)
- `GET /api/resumes`: Return all stored profiles.
- `DELETE /api/resumes/:id`: Delete a specific resume profile and its associated jobs.
- `DELETE /api/resumes`: Delete all resumes.
- Update `state.json` to properly manage an array of profiles rather than just `local-user`.

### 2. Resume Builder Backend API (`server/builder.mjs` & `server/index.mjs`)
- Add dependencies: `pizzip` and `docxtemplater` to manipulate the template.
- Implement a pre-processing script to replace literal text in `src/assets/Resume_Template.docx` with `docxtemplater` placeholders (`{{fullName}}`, `{{email}}`, etc.).
- `POST /api/resumes/build`: 
  - Receives builder form JSON.
  - Loads the prepared template, applies the data, and generates a binary `.docx` buffer.
  - Passes the generated text into `profileFromText` to guarantee 100% confidence.
  - Saves the new profile and returns the `.docx` file for download.

### 3. Frontend Multi-Resume UI (`src/main.tsx`)
- **Resume Switcher**: Replace the hardcoded `profile.filename` header with a `<select>` dropdown (or a list) showing all uploaded/built resumes.
- **Delete Buttons**: Add a trash icon next to the active resume to delete it, and a "Clear All" option.
- **State Management**: Introduce `resumes: Profile[]` and `activeResumeId: string` to the frontend state. Changing the active resume will automatically update the `Role focus`, `Skills`, and `Location` inputs.

### 4. Frontend Resume Builder Modal
- Add a **"Build Resume"** button next to the "Upload resume" button.
- Build a React Modal containing a structured form:
  - **Identity**: Name, Phone, Email, Location.
  - **Skills**: Languages/Frameworks, Database/Cloud, Others.
  - **Experience**: Dynamic list allowing users to add multiple roles (Company, Dates, Role, Description, Tech stack).
  - **Education**: Degree, College, Dates.
- On submission, calls `/api/resumes/build`, downloads the `.docx`, and sets it as the active resume.

## Verification Plan
1. **Automated Check**: Verify server starts without errors and `npm run check` passes.
2. **Manual Test - Multi-Resume**: 
   - Upload Resume A, verify it becomes active.
   - Upload Resume B, verify it becomes active.
   - Switch back to Resume A, ensure fields (Roles, Skills) update.
   - Delete Resume B, ensure it vanishes from the list.
3. **Manual Test - Builder**:
   - Open builder, fill out mock data.
   - Submit. Verify a `.docx` is downloaded and matches the provided template layout.
   - Verify the newly built resume is immediately available in the resume switcher.
