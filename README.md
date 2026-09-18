# Coolest Projects Judging Form

Judges use one link: **[rpf.io/judging](https://rpf.io/judging)**

## How it fits together

| Piece | What it is |
| --- | --- |
| `index.html` | The form itself, served by GitHub Pages. |
| `desks.json` | The desk list, prefilled into the form. A static file in this repo. |
| `apps-script/Code.gs` | The script that writes scores into **rpf.io/judging-scores**. |
| `tools/make_desks.py` | Rebuilds `desks.json` from **rpf.io/judging-input**. |

Desk data is **not** read live from the spreadsheet. It is baked into `desks.json`
and served from the same site as the form, so prefill cannot fail at the venue.
The only network call during judging is the one that saves a score.

## Before each event

1. Update **rpf.io/judging-input** with this event's desks, projects and judges.
2. Rebuild the desk list:
   - Open rpf.io/judging-input, then `File > Download > Comma-separated values (.csv)`
   - Run:
     ```bash
     python3 tools/make_desks.py ~/Downloads/judging-input.csv
     ```
   - Commit and push the updated `desks.json`. GitHub Pages redeploys in about a minute.
3. Open **rpf.io/judging-scores** and clear out the previous event's rows, leaving the
   header row intact.
4. In the Apps Script editor, run `clearSubmissionHistory` once. This clears the stored
   submission ids and does not touch the sheet.
5. Open rpf.io/judging, pick a desk, submit one test score, check it lands in the sheet,
   then delete that test row.

## After each event

Copy the data out of `Sheet1` of rpf.io/judging-scores and save it elsewhere. That
sheet gets cleared for the next event.

## Deploying a change to the Apps Script

Paste the new contents over the whole script, then:

`Deploy > Manage deployments > pencil icon > Version: New version > Deploy`

Choosing **New version** on the existing deployment keeps the same `/exec` URL, so
`index.html` does not need editing. Creating a *new deployment* instead would issue a
different URL and break the form.

## Things that will break it

- Renaming the spreadsheets, or the `Sheet1` tab inside judging-scores.
- Reordering or renaming the columns in either sheet.
- Creating a new Apps Script deployment rather than a new version of the existing one.

## What a judge sees if something goes wrong

The form never reports a score as saved unless the server has confirmed it. If a save
does not go through it is held on the judge's device, retried automatically, and a
banner stays at the top of the page saying how many scores are still waiting. As long
as the judge keeps the page open, nothing is lost.

## History

The prefilled desk data used to be fetched live from an Apps Script endpoint on every
page load. That endpoint took 8-54 seconds to answer and returned a 404 HTML page
whenever it was called concurrently (measured: 4 of 4 parallel browser requests failed,
6 of 6 parallel command-line requests failed), which left the desk dropdown empty
whenever several judges opened the form at once. It is no longer used.

Separately, the submit script had no locking. Ten concurrent submissions were tested
against it: all ten received `{"result":"success"}` but only three rows reached the
sheet, because concurrent executions each read the same last-row position and
overwrote one another. `apps-script/Code.gs` fixes that with `LockService` and
`appendRow`.
