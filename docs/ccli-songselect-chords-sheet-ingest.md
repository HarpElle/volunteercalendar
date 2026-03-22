Implement the following song import, storage, editing, and StageSync display system exactly as specified for VolunteerCal.com. Use the existing Next.js codebase and choose the most effective, performant, and maintainable technologies that integrate seamlessly with the current architecture. If a relational database is already in use, extend it; otherwise select the best storage solution that supports structured JSON, fast reads for real-time display, and per-organization isolation. For any conversion or parsing steps, select the most accurate and cost-effective method available in the stack (such as a vision-capable AI model for PDFs or a robust parsing library) while maintaining high fidelity to original chords, lyrics, sections, and metadata.

Project goal: Enable churches to import songs from CCLI SongSelect via ChordPro files (preferred) or PDF chord charts (fallback). Automatically convert PDFs into a structured, editable format. Store everything privately per church/organization only — never create or share a global library across users. Support full editing (key changes, multiple arrangements, notes, section reordering, formatting tweaks), transposition, and optimized real-time rendering on the existing StageSync display. Ensure every feature complies with CCLI licensing by requiring each church to provide their CCLI number and attest to holding an active Church Copyright License.

Core rules that must never be violated:
- All song data must be isolated to the uploading church's organization/account.
- No song content may be accessible or duplicated across different churches.
- Users must enter their official CCLI number during onboarding or church setup.
- Add a mandatory checkbox attestation: "I confirm that my church holds an active CCLI Church Copyright License and that all songs used in VolunteerCal are covered under that license."
- Store the CCLI number in the church/organization record and include it automatically in any generated CCLI reports.
- Add a visible compliant disclaimer on the import page: "All songs are stored privately in your account and used only under your church’s CCLI license. We help you generate reports for easy submission to CCLI."

Upload flow the user must see:
- Prominent button: "Upload ChordPro (.pro or .chordpro) – best quality (Premium recommended)"
- Secondary option: "Or upload PDF from SongSelect – we will convert it automatically"
- Drag-and-drop area accepting both file types.
- After upload, show progress and immediately make the song available with auto-filled metadata (title, artist, CCLI number, copyright, key, tempo, time signature).

Conversion and storage requirements:
- For ChordPro files: parse directly into structured data.
- For PDFs: implement server-side extraction and conversion to the same structured format, preserving every chord, lyric line, section label (Verse, Chorus, Ending, etc.), and metadata with maximum accuracy.
- Store the original uploaded file (PDF or ChordPro) for reference.
- Primary storage format must be a structured JSON object optimized for:
  - Instant key transposition
  - Multiple saved arrangements per song
  - Inline editing of lyrics/chords/sections
  - Fast rendering on StageSync (large readable lyrics with chords above, auto-scroll support, offline caching)
- Suggested JSON structure (adapt if a better format fits the codebase):
  - title, artist, originalKey, ccliNumber, copyright, tempo, timeSignature
  - array of sections, each containing type (Verse, Chorus, etc.) and array of lines
  - each line contains optional chord and lyrics text (split for precise chord-over-lyric alignment)
- Create a songs table/record and a separate song_arrangements table/record linked by song ID. Each arrangement stores its own key, content JSON, user notes, and name (e.g., "Key of G – Original", "Key of A – Easier").

Required features users must be able to perform:
- View and edit any arrangement (change key with one-click transposition that updates the entire chart)
- Create new arrangements from an existing one
- Duplicate any song within the same church's library (so popular songs never need re-uploading)
- Add/edit inline notes on arrangements
- Reorder sections, add/delete sections, modify lyric/chord text
- Adjust formatting (font sizes, bold chorus, etc.) stored as metadata in the JSON
- Export or generate CCLI usage reports that include the church's stored CCLI number and are ready for manual upload to reporting.ccli.com

StageSync integration:
- Build or extend a StageSync viewer component that consumes the structured JSON directly for real-time display.
- Support large, clear fonts, chord highlighting, and live updates when the service plan advances.
- Ensure the display works offline once the arrangement is loaded.

UI text to add or update (use exactly or adapt slightly for tone):
- SongSelect Import section heading and description: "Import songs from CCLI SongSelect by uploading exported ChordPro (.pro or .chordpro) or PDF files. ChordPro is best for perfect results (Premium recommended). We automatically convert PDFs into editable, transposable charts. Metadata fills in automatically and duplicates are caught before they reach your library."
- Add the compliance disclaimer immediately below the upload area.

Implementation order:
1. Add CCLI number field and attestation checkbox to the church/organization signup or settings flow; store in database.
2. Create the import API endpoint that handles both file types, performs conversion, saves original file, generates structured JSON, and stores per-church.
3. Build or extend the song library UI with upload component and duplicate-song functionality.
4. Implement transposition utility (client and server) that works on the structured JSON.
5. Create or update the song editor page supporting key changes, arrangements, notes, and formatting.
6. Build or update the StageSync display component to render the new structured format efficiently.
7. Add CCLI report generator that pulls usage data and includes the church's CCLI number.

After implementation, ensure the system remains fully private per church, handles all SongSelect PDF layouts accurately, and requires no additional subscriptions beyond the user's existing CCLI license. Test with sample SongSelect PDFs and ChordPro files to verify fidelity. Provide any necessary migration steps if existing songs are already stored in the codebase.