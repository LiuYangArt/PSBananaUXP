const { core } = require('photoshop');

document.getElementById("btnTest").addEventListener("click", async () => {
    try {
        await core.showAlert({ message: "PS Banana: Test Successful!" });
    } catch (e) {
        console.error(e);
    }
});
