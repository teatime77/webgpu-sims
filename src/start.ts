import { Article, bootstrap, schemaText, setAfterFrame, theArticles } from "./main.js";
import { msg, assert, $, $btn, $div, $inp, downloadMarkdownFile, hideHtml, MyError, showHtml, $txt, copyToClipboard, showToast, captureThumbnail, $img, fetchText, urlBase } from "./utils.js";
// import { initArticle, makeArticleData, makeContentText, updatePreview } from "./article";
import { makeWgslSkeleton } from "./generate_skeleton.js";
import { SimulationSchema, theDevice, theRunner, theSchema } from "./SimulationRunner.js";
import {  clearShaderEditors, makeShaderEditors, setNodeShaderCode } from "./editor.js";
import { parseSchema } from "./parser.js";

export type ViewName = "login-view" | "main-view" | "edit-view" | "article-view" | "wizard-view" | "user-view";

export let appManager : AppManager;
let initialPath : string;

export function setAppManager(app: AppManager){
    appManager = app;
}

export class AppManager {
    loginView: HTMLDivElement;
    mainView: HTMLDivElement;
    editView: HTMLDivElement;
    wizardView: HTMLDivElement;
    views : HTMLDivElement[];

    constructor(){
        this.loginView = $div("login-view");
        this.mainView = $div("main-view");
        this.editView = $div("edit-view");
        this.wizardView = $div("wizard-view");

        this.views = [this.loginView, this.mainView, this.editView, this.wizardView];

        const buttons = document.getElementsByClassName("app-title-button");
        for(const button of buttons){
            (button as HTMLButtonElement).addEventListener("click", ()=>{
                this.navigateTo("/");
            });
        }
    }

    initRender(){
        initialPath = window.location.pathname;

        // 初期表示のURLもHistory APIのstateに登録しておく（最初に戻ってきた時用）
        window.history.replaceState({ path: initialPath }, '', initialPath);
        // msg(`init-history:${initialPath}`);

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
        // msg(`render-Page:${path}`);
        if (path === '/' || path === '/home') {
            clearSchema();
            $txt("schema-text").value = "";
            clearShaderEditors();

            this.showView("main-view");
        } 
        else if (path.startsWith("/post/")) {
            clearSchema();
            this.showView("edit-view");
            const texts = path.split("/");
            assert(texts.length == 3);
            const idx = parseInt(texts[2]);
            assert(!(isNaN(idx)) && 0 <= idx && idx < theArticles.length)
            // msg(`post:${texts}`);
            const article = theArticles[idx];

            const schemaText = await fetchText(article.schemaUrl);
            const schema = makeSimulationSchema(schemaText);
            for(const node of schema.shaders){
                if(node.type == "compute"){
                    const path = article.schemaUrl.replace("schema.js", `${node.id}.wgsl`);
                    node.nodeShaderCode = await fetchText(path);
                }
            }

            $img("thumbnail-img").src = `${urlBase}/${article.thumbnailUrl}`;
            msg(`thumbnail-img-src:${$img("thumbnail-img").src}`);

            $txt("schema-text").value = schemaText;
            makeShaderEditors();

            await bootstrap(schema);
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
        // msg(`push-State:${path}`);

        // URLが変わったので画面を再描画する
        this.renderPage(path);
    }

}

export function initWebGpuSimsNavigationManager(){
    appManager = new AppManager();
    appManager.initRender();
}

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
