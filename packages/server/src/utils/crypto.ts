export const hexEncode = (buffer: ArrayBuffer): string =>
	Array.from(new Uint8Array(buffer))
		.map(b => b.toString(16).padStart(2, "0"))
		.join("");

export const hashToken = async (token: string): Promise<string> => {
	const encoder = new TextEncoder();
	const data = encoder.encode(token);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	return hexEncode(hashBuffer);
};
