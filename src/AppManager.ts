import { clearShaderEditors, makeShaderEditors } from "./editor.js";
import { Article, bootstrap, getArticles, getContents, theArticles } from "./main.js";
import { makeSimulationSchema } from "./parser.js";
import { clearSchema } from "./start.js";
import { $, $div, $img, $txt, assert, fetchText, msg, setUrlHome, sleep, urlBase, urlHash, urlHome, urlOrigin, urlPathName } from "./utils.js";

export type ViewName = "main-view" | "edit-view" | "article-view" | "wizard-view" | "user-view" | "landing-view";

export let appManager : AppManager;
export let initialPath : string;

export function setAppManager(app: AppManager){
    appManager = app;
}

export class AppManager {
    isStaticServer: boolean;
    landingView: HTMLDivElement;
    mainView: HTMLDivElement;
    editView: HTMLDivElement;
    wizardView: HTMLDivElement;
    views : HTMLDivElement[];

    constructor(){
        this.isStaticServer = true;
        this.landingView = $div("landing-view");
        this.mainView = $div("main-view");
        this.editView = $div("edit-view");
        this.wizardView = $div("wizard-view");

        this.views = [ this.landingView, this.mainView, this.editView, this.wizardView];

        const buttons = document.getElementsByClassName("app-title-button");
        for(const button of buttons){
            (button as HTMLButtonElement).addEventListener("click", ()=>{
                this.clearArticle();
                window.location.href = urlHome;
                // this.showView("landing-view");
            });
        }
    }

    getUrlPathName() : string {
        if(urlHash != ""){
            assert(urlHash.startsWith("#/"));
            return urlHash.substring(1);
        }
        else{
            
            return "/";
        }
    }

    initRender(){
        initialPath = window.location.pathname;

        const path = this.getUrlPathName();

        // 初期表示のURLもHistory APIのstateに登録しておく（最初に戻ってきた時用）
        window.history.replaceState({ path }, '', initialPath);
        // msg(`init-history:${initialPath}`);

        this.renderPage(path);
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

    clearArticle(){
        clearSchema();
        $txt("schema-text").value = "";
        $img("thumbnail-img").src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

        clearShaderEditors();
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

        $img("thumbnail-img").src = article.thumbnailUrl;
        msg(`thumbnail-img-src:${$img("thumbnail-img").src}`);

        $txt("schema-text").value = schemaText;
        makeShaderEditors();

        await bootstrap(schema);
    }

    // --- 1. 画面の描画関数 ---
    // URL（パス）に応じてDOMを書き換える
    async renderPage(path: string) {
        // msg(`render-Page:${path}`);
        if (path === '/gallery') {
            this.clearArticle();

            this.showView("main-view");
            await getContents();
        } 
        else if (path.startsWith("/post/")) {
            clearSchema();
            this.showView("edit-view");
            const texts = path.split("/");
            assert(texts.length == 3);
            const id = texts[2];
            // msg(`post:${texts}`);
            if(theArticles.length == 0){
                await getArticles();
            }
            const article = theArticles.find(x => x.id == id)!;
            assert(article != undefined);
            await this.showArticle(article);
        }
        else if(path == "/wizard"){
            clearSchema();
            this.showView("wizard-view");
        } 
        else if(path == "/"){
            this.showView("landing-view");
        }
        else{
            msg(`render page:[${path}]`);
        }

    }

    // --- 2. 画面遷移の処理（履歴の追加） ---
    navigateTo(view: string) {
        // 第1引数: 保存したい状態(state)
        // 第2引数: タイトル(現在はほとんどのブラウザで無視されるため空文字でOK)
        // 第3引数: 新しいURLパス
        let url: string;
        if(this.isStaticServer){
            url = `${urlHome}#${view}`;
        }
        else{
            url = view;
        }

        window.history.pushState({ path: view }, '', url);
        // msg(`push-State:${path}`);

        // URLが変わったので画面を再描画する
        this.renderPage(view);
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
    setUrlHome(urlOrigin + urlPathName);
    appManager.initRender();
}
