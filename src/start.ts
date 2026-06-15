import { Article, bootstrap, schemaText, setAfterFrame, theArticles } from "./main.js";
import { msg, assert, $, $btn, $div, $inp, downloadMarkdownFile, hideHtml, MyError, showHtml, $txt, copyToClipboard, showToast, captureThumbnail, $img, fetchText, urlBase, sleep } from "./utils.js";
// import { initArticle, makeArticleData, makeContentText, updatePreview } from "./article";
import { makeWgslSkeleton } from "./generate_skeleton.js";
import { SimulationSchema, theSchema } from "./schema.js";
import { theDevice, theRunner } from "./SimulationRunner.js";
import {  makeShaderEditors, setNodeShaderCode } from "./editor.js";
import { parseSchema } from "./parser.js";
import {  } from "./index.js";
import { appManager, initialPath } from "./AppManager.js";


export function makeSimulationSchema(jsonText: string){
    try {

        const k = jsonText.indexOf("//# sourceMappingURL=data:application/json;");
        if(k != -1){
            jsonText = jsonText.substring(0, k);
        }

        const schemaDef = parseSchema(jsonText);
        const schema = new SimulationSchema(theDevice, schemaDef);

        return schema;
    } catch (e) {
        throw new MyError();
    }
}

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

        let currentPath = event.state.path;
        assert(typeof currentPath == "string");
        // msg(`pop-state:${currentPath}`);

        if(currentPath == initialPath){
            currentPath = "/";
        }

        // stateが存在すればそのパスを、なければ現在のURLのパスを再描画する
        // const currentPath = state?.path || window.location.pathname;
        appManager.renderPage(currentPath);
    });

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
        showToast($btn("copy-rulebook-btn"), "Text successfully copied to clipboard!");
    });

    $btn("create-copy-skeleton-btn").addEventListener("click", async()=>{
        const wgslSkeleton = makeWgslSkeleton($txt("schema-text").value);
        const instruction = "Implement WGSL functions.\n\n"
                            + wgslSkeleton;

        await copyToClipboard(instruction);
        showToast($btn("create-copy-skeleton-btn"), "Text successfully copied to clipboard!");

        makeShaderEditors();
    });

    $btn("run-sim-btn").addEventListener("click", async ()=>{
        clearSchema();
        appManager.showView("edit-view");

        const jsonText = $txt("schema-text").value;

        const schema = makeSimulationSchema(jsonText);
        setNodeShaderCode();
        await bootstrap(schema);
    });

    $btn("thumbnail-btn").addEventListener("click", ()=>{
        setAfterFrame(captureThumbnail);
    });

}
