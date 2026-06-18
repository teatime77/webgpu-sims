import { clearShaderEditors, makeShaderEditors } from "./editor.js";
import { Article, bootstrap, theArticles } from "./main.js";
import { makeSimulationSchema } from "./parser.js";
import { clearSchema } from "./start.js";
import { $, $div, $img, $txt, assert, fetchText, msg, sleep, urlBase } from "./utils.js";

export type ViewName = "login-view" | "main-view" | "edit-view" | "article-view" | "wizard-view" | "user-view";

export let appManager : AppManager;
export let initialPath : string;

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

    async showArticle(article : Article){
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

    // --- 1. 画面の描画関数 ---
    // URL（パス）に応じてDOMを書き換える
    async renderPage(path: string) {
        // msg(`render-Page:${path}`);
        if (path === '/' || path === '/home') {
            clearSchema();
            $txt("schema-text").value = "";
            $img("thumbnail-img").src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

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
            await this.showArticle(article);
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

    async showAll(){
        for(const article of theArticles){
            this.showView("edit-view");
            await this.showArticle(article);
            await sleep(3000);
            this.navigateTo('/');
        }
    }
}

export function initWebGpuSimsNavigationManager(){
    appManager = new AppManager();
    appManager.initRender();
}
