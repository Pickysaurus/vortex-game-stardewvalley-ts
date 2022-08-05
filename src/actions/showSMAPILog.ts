import * as path from 'path';
import { fs, types, util } from 'vortex-api';
import { clipboard } from 'electron';
import { app } from '@electron/remote';

async function onShowSMAPILog(api: types.IExtensionApi) {
    //Read and display the log.
    const basePath = path.join(util.getVortexPath('appData'), 'stardewvalley', 'errorlogs');
    try {
      //If the crash log exists, show that.
      await showSMAPILog(api, basePath, "SMAPI-crash.txt");
    } catch (err) {
      try {
        //Otherwise show the normal log.
        await showSMAPILog(api, basePath, "SMAPI-latest.txt");
      } catch (err) {
        //Or Inform the user there are no logs.
        api.sendNotification({ type: 'info', title: 'No SMAPI logs found.', message: '', displayMS: 5000 });
      }
    }
}

async function showSMAPILog(api: types.IExtensionApi, basePath: string, logFile: string) {
    const logData = await fs.readFileAsync(path.join(basePath, logFile), { encoding: 'utf-8' });
    await api.showDialog('info', 'SMAPI Log', {
      text: 'Your SMAPI log is displayed below. To share it, click "Copy & Share" which will copy it to your clipboard and open the SMAPI log sharing website. ' +
        'Next, paste your code into the text box and press "save & parse log". You can now share a link to this page with others so they can see your log file.\n\n' + logData
    }, [{
      label: 'Copy & Share log', action: () => {
        const timestamp = new Date().toISOString().replace(/^.+T([^\.]+).+/, '$1');
        clipboard.writeText(`[${timestamp} INFO Vortex] Log exported by Vortex ${app.getVersion()}.\n` + logData);
        return util.opn('https://smapi.io/log').catch(() => undefined);
      }
    }, { label: 'Close', action: () => undefined }]);
}

export default onShowSMAPILog;