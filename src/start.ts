import { bootstrap, schemaText, setAfterFrame } from "./main.js";
import { msg, assert, $, $btn, $div, $inp, downloadMarkdownFile, hideHtml, MyError, showHtml, $txt, copyToClipboard, showToast, captureThumbnail } from "./utils.js";
// import { initArticle, makeArticleData, makeContentText, updatePreview } from "./article";
import { makeWgslSkeleton } from "./generate_skeleton.js";
import { SimulationSchema, theDevice, theRunner, theSchema } from "./SimulationRunner.js";
import {  clearShaderEditors, makeShaderEditors, setNodeShaderCode } from "./editor.js";
import { parseSchema } from "./parser.js";

export type ViewName = "login-view" | "main-view" | "edit-view" | "article-view" | "wizard-view" | "user-view";

export let appManager : AppManager;

export function setAppManager(app: AppManager){
    appManager = app;
}

export class AppManager {
    loginView: HTMLDivElement;
    mainView: HTMLDivElement;
    editView: HTMLDivElement;
    articleView: HTMLDivElement;
    wizardView: HTMLDivElement;
    userView : HTMLDivElement;
    views : HTMLDivElement[];

    constructor(){
        const initialPath = window.location.pathname;

        // 初期表示のURLもHistory APIのstateに登録しておく（最初に戻ってきた時用）
        window.history.replaceState({ path: initialPath }, '', initialPath);

        this.loginView = $div("login-view");
        this.mainView = $div("main-view");
        this.editView = $div("edit-view");
        this.articleView = $div("article-view")
        this.wizardView = $div("wizard-view");
        this.userView = $div("user-view");

        this.views = [this.loginView, this.mainView, this.editView, this.articleView, this.wizardView, this.userView];

        this.renderPage(initialPath);
    }

    hideAll(){
        this.views.forEach(x => x.style.display = "none");
    }

    showView(viewName : ViewName){
        const view = $(viewName);
        this.hideAll();
        if(view == this.wizardView){
            view.style.display = "block";
        }
        else{
            view.style.display = "grid";
        }
    }

    // --- 1. 画面の描画関数 ---
    // URL（パス）に応じてDOMを書き換える
    async renderPage(path: string) {
        if (path === '/' || path === '/home') {
            clearSchema();
            $txt("schema-text").value = "";
            clearShaderEditors();

            $inp("title").value = "";
            $txt("markdown-text").value = "";

            this.showView("main-view");
        } 
        else if(path == "/wizard"){
            clearSchema();
            this.showView("wizard-view");
        } 
    }

    // --- 2. 画面遷移の処理（履歴の追加） ---
    navigateTo(path: string) {
        // 第1引数: 保存したい状態(state)
        // 第2引数: タイトル(現在はほとんどのブラウザで無視されるため空文字でOK)
        // 第3引数: 新しいURLパス
        window.history.pushState({ path }, '', path);

        // URLが変わったので画面を再描画する
        this.renderPage(path);
    }

}

export function initWebGpuSimsNavigationManager(){
    appManager = new AppManager();
}

function makeSimulationSchema(jsonText: string){
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

export function splitContentText(contentText : string) : [string, string, SimulationSchema]{
    const lines = contentText.replaceAll("\r", "").split("\n");
    const startJsonet = lines.findIndex(x => x.startsWith("<!-- START OF SCHEMA."));
    const endJsonet = lines.findIndex((x, i) => startJsonet < i && x == "```");
    const startWgsl   = lines.findIndex(x => x.startsWith("<!-- START OF WGSL."));

    assert(startJsonet != -1 && startJsonet < endJsonet && endJsonet < startWgsl);
    assert(lines[startJsonet + 1] == "```jsonet")

    const jsonText = lines.slice(startJsonet + 2, endJsonet).join("\n");
    const markdownText = lines.slice(0, startJsonet).join("\n");

    const schema = makeSimulationSchema(jsonText);

    let idx = startWgsl + 1;
    while(idx < lines.length){
        let line = lines[idx];
        if(line.trim() == ""){
            idx++;
            continue;
        }

        let nodeId = "";
        if(line.startsWith("SHADER:")){
            nodeId = line.substring("SHADER:".length);            
            idx++;
        }
        else{
            const computeNodes = schema.computeNodes();
            assert(computeNodes.length == 1);
            nodeId = computeNodes[0].id;
        }

        assert(idx < lines.length && lines[idx] == "```wgsl");
        idx++;

        let codes = "";
        for(; idx < lines.length; idx++){
            let line = lines[idx];
            if(line == "```"){

                const node = schema.nodeMap.get(nodeId)!;
                assert(node != undefined);
                node.nodeShaderCode = codes;

                idx++;
                break;
            }

            codes += line + "\n";                     
        }
    }

    msg(`content-Text:[\n${contentText}]`);
    return [markdownText, jsonText, schema];
}

export function clearSchema(){
    if(theRunner != undefined){
        theRunner.clearCanvases();
    }

    if(theSchema == undefined){
        return;
    }

    Array.from(theSchema.resources.values()).forEach(x => x.destroyBuffers());
    theSchema.resources.clear();
    theSchema.shaders = [];
    msg("clear Schema");
}

export function initEventHandler(){
    // --- 3. 「戻る」「進む」ボタンの検知 ---
    window.addEventListener('popstate', (event: PopStateEvent) => {
        // pushStateで保存した state オブジェクトを取得
        const state = event.state;

        // stateが存在すればそのパスを、なければ現在のURLのパスを再描画する
        const currentPath = state?.path || window.location.pathname;
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

    $btn("add-details").addEventListener("click", ()=>{
        appManager.showView("article-view");
    });


    $btn("thumbnail-btn").addEventListener("click", ()=>{
        setAfterFrame(captureThumbnail);
    });

}
