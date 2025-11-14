// See https://developers.google.com/apps-script/guides/properties
// for instructions on how to set the script properties.
const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
const model = 'gemini-2.5-pro-preview-tts';
const api = 'streamGenerateContent';
const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:${api}?key=${apiKey}`;

// TODO(developer): Set Drive Folder name and file prefix.
const driveFolderName = '';
const filePrefix = '';

function main() {
  const payload = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `INSERT_INPUT_HERE`
          },
        ]
      },
    ],
    generationConfig: {
      responseModalities: [
          'audio',
      ],
      temperature: 1,
      speech_config: {
        voice_config: {
          prebuilt_voice_config: {
            voice_name: 'Zephyr',
          }
        }
      },
    },
  };

  const options = {
    method: 'POST',
    contentType: 'application/json',
    muteHttpExceptions: true,
    payload: JSON.stringify(payload),
  };

  let fileIndex = 0;
  const response = UrlFetchApp.fetch(url, options);
  const chunks = JSON.parse(response.getContentText());

  for (const chunk of chunks) {
    if (!chunk.candidates || !chunk.candidates[0].content || !chunk.candidates[0].content.parts) {
      continue;
    }
    if (chunk.candidates?.[0]?.content?.parts?.[0]?.inlineData) {
      const fileName = `${filePrefix}-${fileIndex++}`;
      const {mimeType, data} = chunk.candidates[0].content.parts[0].inlineData;
      const file = saveToDrive(fileName, mimeType, data);
      console.log(file.getUrl());
    } else {
      console.log(chunk.candidates[0].content.parts[0].text);
    }
  }
}

/**
 * Decodes a base64 string and saves the decoded data as a file in a specified Google Drive folder.
 *
 * @param {string} fileName The desired name for the output file.
 * @param {string} mimeType The MIME type of the file.
 * @param {string} data The base64 encoded data.
 * @return {!GoogleAppsScript.Drive.File} The newly created file object.
 */
function saveToDrive(fileName, mimeType, data) {
  if (!data || !fileName) {
    throw new Error('Cannot save file: base64 data or filename is missing.');
  }

  const bytes = Utilities.base64Decode(data);
  const blob = Utilities.newBlob(bytes, mimeType, fileName);
  const folder = getOrCreateFolder(driveFolderName);

  return folder.createFile(blob);
}

/**
 * Finds a folder by name, creating it if it doesn't exist.
 *
 * @param {string} folderName The name of the folder to find or create.
 * @return {!GoogleAppsScript.Drive.Folder} The folder object.
 */
function getOrCreateFolder(folderName) {
  const folders = DriveApp.getFoldersByName(folderName);

  if (folders.hasNext()) {
    // Return the existing folder
    return folders.next();
  }

  // Create and return a new folder
  return DriveApp.createFolder(folderName);
}
