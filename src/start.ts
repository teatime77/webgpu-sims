import { initializeApp } from "firebase/app";
import {
    getAuth,
    GoogleAuthProvider,
    EmailAuthProvider,
    onAuthStateChanged,
    type User,
    signOut
} from "firebase/auth";
import {
    getFirestore,
    doc,
    getDoc,
    runTransaction,
    serverTimestamp
} from "firebase/firestore";
import * as firebaseui from "firebaseui";
import "firebaseui/dist/firebaseui.css";
import { bootstrap } from "./main";

// -------------------------------------------------------------
// 1. Firebase 初期化
// -------------------------------------------------------------
const firebaseConfig = {
    apiKey: "AIzaSyAXx3bVV-cJLR5FFg3xsb6BHK9U7ufMnag",
    authDomain: "gpusims.firebaseapp.com",
    projectId: "gpusims",
    storageBucket: "gpusims.firebasestorage.app",
    messagingSenderId: "351327742687",
    appId: "1:351327742687:web:e76c82c1accf432428976a",
    measurementId: "G-C81XLP99XH"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// -------------------------------------------------------------
// 2. 状態管理とルーティング
// -------------------------------------------------------------
type AppState = "LOADING" | "SHOW_LOGIN" | "SHOW_SETUP" | "MAIN_APP";

const appContainer = document.getElementById("app") as HTMLDivElement;

// 認証状態やpublicIdの有無に応じてヘッダーの表示を更新する関数
function updateHeaderActions(user: any, publicId: string | null) {
    const authActionsContainer = document.getElementById("headerAuthActions");
    if (!authActionsContainer) return;

    if (user && publicId) {
        // 【A】 サインイン済みの場合
        authActionsContainer.innerHTML = `
      <li><button id="headerLogoutBtn" class="secondary outline" style="margin-bottom:0;">サインアウト</button></li>
      <li><button id="headerPostBtn" style="margin-bottom:0;">投稿</button></li>
      <li>
        <span id="headerUserId" style="font-weight: bold; font-size: 0.9rem;">
          @${publicId}
        </span>
      </li>
    `;

        // ログアウトボタンのイベントリスナー
        document.getElementById("headerLogoutBtn")?.addEventListener("click", () => {
            // Firebase Authのログアウト処理を呼び出す
            import("firebase/auth").then(({ getAuth, signOut }) => {
                signOut(getAuth());
            });
        });

        // 投稿ボタンのイベントリスナー
        document.getElementById("headerPostBtn")?.addEventListener("click", () => {
            // 投稿画面への遷移処理など
            console.log("投稿画面へ移動");
        });

    } else {
        // 【B】 サインインしていない（または初期設定前）の場合
        authActionsContainer.innerHTML = `
      <li><button id="headerLoginBtn" style="margin-bottom:0;">サインイン</button></li>
    `;

        document.getElementById("headerLoginBtn")?.addEventListener("click", () => {
            // ログイン画面（FirebaseUI表示状態）へ遷移させる処理
            // 例: navigateTo("SHOW_LOGIN");
        });
    }
}

// 画面の切り替え処理
function renderApp(state: AppState, user: User | null = null) {
    appContainer.innerHTML = ""; // 画面クリア

    switch (state) {
        case "LOADING":
            appContainer.innerHTML = `<div>読み込み中...</div>`;
            break;

        case "SHOW_LOGIN":
            appContainer.innerHTML = `
        <div>
          <h2>ログイン / 新規登録</h2>
          <div id="firebaseui-auth-container"></div>
        </div>
      `;
            startFirebaseUI();
            break;

        case "SHOW_SETUP":
            if (!user) return;
            appContainer.innerHTML = `
        <div>
          <h2>ユーザーIDの初期設定</h2>
          <p>他のユーザーに公開される一意のID（publicId）を決めてください。</p>
          <input type="text" id="publicIdInput" placeholder="例: ko_hamada" />
          <button id="registerBtn">登録する</button>
          <p id="errorMsg" style="color: red;"></p>
        </div>
      `;
            setupRegistrationForm(user);
            break;

        case "MAIN_APP":
            document.getElementById("logoutBtn")?.addEventListener("click", () => {
                signOut(auth);
            });
            break;
    }
}

// -------------------------------------------------------------
// 3. 認証状態の監視 (Single Source of Truth)
// -------------------------------------------------------------
onAuthStateChanged(auth, async (user) => {
    let publicId;
    if (user) {
        try {
            console.log("Firebase Auth ログイン成功! UID:", user.uid);

            // ★ 1. Firestore からデータを取得（ここでエラーが起きやすいです）
            const userRef = doc(db, "users", user.uid);
            const userSnap = await getDoc(userRef);

            // ★ 2. 取得に成功したら画面を切り替える
            if(userSnap.exists()){
                publicId = userSnap.data().publicId;
            }

            if (publicId) {
                renderApp("MAIN_APP", user);

                // await bootstrap();
            } 
            else {
                renderApp("SHOW_SETUP", user);
            }
        } 
        catch (error) {
            // ★ 3. エラーが発生した場合、原因を画面に赤く表示する
            console.error("Firestoreでエラーが発生しました:", error);
        }
    } 
    else {
        // 未ログイン時はログイン画面を表示
        renderApp("SHOW_LOGIN");
    }

    updateHeaderActions(user, publicId);
});

// 初期状態はローディング
renderApp("LOADING");

// -------------------------------------------------------------
// 4. FirebaseUI の起動
// -------------------------------------------------------------
function startFirebaseUI() {
    const ui = firebaseui.auth.AuthUI.getInstance() || new firebaseui.auth.AuthUI(auth);

    ui.start("#firebaseui-auth-container", {
        // ★ 追加：サインインフローをポップアップ方式に強制する
        signInFlow: 'popup',

        signInOptions: [
            GoogleAuthProvider.PROVIDER_ID,
            EmailAuthProvider.PROVIDER_ID,
        ],
        callbacks: {
            // ログイン成功時に自動リダイレクトするのを防ぐ
            signInSuccessWithAuthResult: () => false
        }
    });
}

// -------------------------------------------------------------
// 5. publicId のトランザクション登録
// -------------------------------------------------------------
function setupRegistrationForm(user: User) {
    const registerBtn = document.getElementById("registerBtn") as HTMLButtonElement;
    const publicIdInput = document.getElementById("publicIdInput") as HTMLInputElement;
    const errorMsg = document.getElementById("errorMsg") as HTMLParagraphElement;

    registerBtn.addEventListener("click", async () => {
        const desiredId = publicIdInput.value.trim();
        if (!desiredId) {
            errorMsg.textContent = "IDを入力してください。";
            return;
        }

        registerBtn.disabled = true;
        errorMsg.textContent = "登録中...";

        const profileRef = doc(db, "profiles", desiredId);
        const userRef = doc(db, "users", user.uid);

        try {
            await runTransaction(db, async (transaction) => {
                const profileDoc = await transaction.get(profileRef);

                if (profileDoc.exists()) {
                    throw new Error("ID_ALREADY_TAKEN");
                }

                // 新規登録 (displayName はGoogleアカウント名などを初期値に使用)
                transaction.set(profileRef, {
                    displayName: user.displayName || "名無しユーザー",
                    iconUrl: user.photoURL || "",
                    createdAt: serverTimestamp()
                });

                transaction.set(userRef, {
                    publicId: desiredId,
                    email: user.email || ""
                });
            });

            // トランザクション成功：
            // Firestoreの更新後、状態をMAIN_APPへ移行
            renderApp("MAIN_APP", user);

        } catch (error: any) {
            registerBtn.disabled = false;
            if (error.message === "ID_ALREADY_TAKEN") {
                errorMsg.textContent = "このIDは既に使用されています。別のIDを指定してください。";
            } else {
                errorMsg.textContent = "エラーが発生しました。もう一度お試しください。";
                console.error("Transaction failed: ", error);
            }
        }
    });
}