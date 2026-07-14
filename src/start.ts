import { bootstrap, schemaText, setAfterFrame } from "./main.js";
import { msg, assert, $btn, $txt, copyToClipboard, showToast, captureThumbnail, $dlg, $div, MyError, displayErrorDialog } from "./utils.js";
import { makeWgslSkeleton } from "./generate_skeleton.js";
import { theSchema } from "./schema.js";
import { theRunner } from "./SimulationRunner.js";
import {  makeShaderEditors } from "./editor.js";
import { appManager } from "./AppManager.js";
import { copyUiValues } from "./SimUI.js";


export function clearSchema(){
    if(theRunner != undefined){
        theRunner.clearCanvases();
    }

    if(theSchema == undefined){
        return;
    }
    theSchema.isReady = false;

    Array.from(theSchema.resources.values()).forEach(x => x.destroyBuffers());
    theSchema.resources.clear();
    theSchema.shaders = [];
    msg("clear Schema");
}

export function initEventHandler(){
    // msg(`init-Event-Handler`);

    // --- 3. 「戻る」「進む」ボタンの検知 ---
    window.addEventListener('popstate', (event: PopStateEvent) => {
        if(event.state == null){
            return;
        }

        let currentPath = event.state.path;
        assert(typeof currentPath == "string");
        // msg(`pop-state:${currentPath}`);

        // if(currentPath == initialPath){
        //     currentPath = "/";
        // }

        // stateが存在すればそのパスを、なければ現在のURLのパスを再描画する
        // const currentPath = state?.path || window.location.pathname;
        appManager.renderPage(currentPath);
    });

    const primaryBtns = Array.from(document.getElementsByClassName("primary-btn")) as HTMLButtonElement[];
    const galleryBtns = Array.from(document.getElementsByClassName("gallery-btn")) as HTMLButtonElement[];

    for(const btn of primaryBtns){
        btn.addEventListener("click", async() => {
             appManager.navigateTo('/wizard');
        });
    }

    for(const btn of galleryBtns){
        btn.addEventListener("click", async() => {
             appManager.navigateTo('/gallery');
        });
    }

    $btn("wizard-btn").addEventListener("click", async() => {
        appManager.navigateTo('/wizard');
    });

    $btn("wizard2-btn").addEventListener("click", async() => {
        appManager.navigateTo('/wizard');
    });

    $btn("copy-rulebook-btn").addEventListener("click", async()=>{
        const instruction = "Read WebGPU Simulation Architecture Overview.\n\n" 
                            + schemaText;

        await copyToClipboard(instruction);
    });

    $btn("create-copy-skeleton-btn").addEventListener("click", async()=>{
        let wgslSkeleton : string;

        try{

            wgslSkeleton = makeWgslSkeleton($txt("schema-text").value);
        }
        catch(e){

            displayErrorDialog("Create Skeleton Error", (e as MyError).message);
            return;
        }

        const instruction = "Implement WGSL functions.\n\n"
                            + wgslSkeleton;

        await copyToClipboard(instruction);

        makeShaderEditors();
    });

    $btn("run-sim-btn").addEventListener("click", ()=>{
        try{

            clearSchema();
            appManager.navigateTo("/run");
        }
        catch(e){

            displayErrorDialog("Run Simulation Error", (e as MyError).message);
            return;
        }
    });

    $btn("restart-btn").addEventListener("click", ()=>{
        try{

            clearSchema();
            appManager.renderPage("/run");
        }
        catch(e){

            displayErrorDialog("Run Simulation Error", (e as MyError).message);
            return;
        }
    });

    $btn("copy-uis-btn").addEventListener("click", async()=>{
        await copyUiValues();
    });

    $btn("thumbnail-btn").addEventListener("click", ()=>{
        setAfterFrame(captureThumbnail);
    });

    $btn("copy-error-btn").addEventListener("click", async()=>{
        await copyToClipboard($div('error-message').textContent);
        showToast("Error message successfully copied to clipboard!", 3);
    });

    $btn('close-dialog-btn').addEventListener("click", ()=>{
        $dlg('error-dialog').close();
    });

}
