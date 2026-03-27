const jsonHeaders = {
    "Content-Type": "application/json"
};
async function request(path, init) {
    const response = await fetch(path, init);
    if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Request failed with ${response.status}`);
    }
    return (await response.json());
}
export const getStatus = () => request("/api/status");
export const getMechanics = async (options) => {
    const params = new URLSearchParams();
    if (options?.ownedOnly) {
        params.set("ownedOnly", "true");
    }
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return (await request(`/api/mechanics${suffix}`)).items;
};
export const searchCards = (params) => request(`/api/cards/search?${params.toString()}`);
export const getCard = (id) => request(`/api/cards/${id}`);
export const uploadCollection = async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    return request("/api/imports/collection-csv", {
        method: "POST",
        body: formData
    });
};
export const listDecks = async () => (await request("/api/decks")).items;
export const getDeck = (id) => request(`/api/decks/${id}`);
export const createDeck = (payload) => request("/api/decks", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(payload)
});
export const updateDeck = (id, payload) => request(`/api/decks/${id}`, {
    method: "PATCH",
    headers: jsonHeaders,
    body: JSON.stringify(payload)
});
export const validateDeck = (id) => request(`/api/decks/${id}/validate`, {
    method: "POST"
});
export const exportDeck = (id) => request(`/api/decks/${id}/export/arena`);
