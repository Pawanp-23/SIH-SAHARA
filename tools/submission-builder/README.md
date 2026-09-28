# Submission builder

Regenerates the SIH26186 idea deck and the PRD from code, so every number stays in sync with the
prototype. Run all commands from this folder.

| File | Purpose |
|---|---|
| `build_ppt.py` | Fills the official SIH 2026 idea template (6 slides) |
| `build_prd.js` | Builds the PRD v2.0 Word document |
| `icons.js` | Renders the slide icons in `icons/` |
| `sih2026_idea_template.pptx` | Official SIH 2026 idea presentation template |
| `welfare_crop.png`, `phone_crop.png` | Cropped live screenshots used on slides 2 and 5 |

## Deck

```powershell
pip install -r requirements.txt
python build_ppt.py sih2026_idea_template.pptx ..\..\docs\submission\SAHARA_SIH26186_Idea_Presentation.pptx
```

Export the result to PDF from PowerPoint (**File → Save As → PDF**) before uploading to the SIH portal.

Team details are set in `build_ppt.py`: `TEAM_NAME` and `TEAM_ID` (defined just above `set_team`) and the
title-slide `vals` dictionary.

## PRD

```powershell
npm install
npm run prd
```

## Refreshing screenshots

Capture new screens with `..\screenshots.ps1`, then crop:

```powershell
python -c "from PIL import Image; im=Image.open('../../docs/screenshots/welfare.png'); im.crop((480,0,2880,1800)).save('welfare_crop.png')"
python -c "from PIL import Image; im=Image.open('../../docs/screenshots/personnel.png'); im.crop((968,151,1745,1760)).save('phone_crop.png')"
```
