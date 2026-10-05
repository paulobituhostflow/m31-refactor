import { createContext, useContext } from 'react';
export const CartinhasSessao = createContext(null);
export const useCartinhasAutora = () => useContext(CartinhasSessao);
