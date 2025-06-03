import numpy as np
import matplotlib.pyplot as plt
from matplotlib import rcParams, font_manager
from matplotlib.colors import to_rgba

def generate_pastel_colors(n):
    colors = plt.cm.Accent(np.linspace(0, 1, n))
    return [to_rgba(c) for c in colors]

# Konfiguracja czcionek i stylu (użytkownika)
# Domyślne ustawienia - użytkownik może je nadpisać swoim kodem
try:
    # Próba załadowania czcionek Arial (jeśli dostępne)
    plt.rcParams['font.family'] = 'Arial'
    plt.rcParams['font.sans-serif'] = ['Arial']
except:
    pass

# Domyślne kolory
colors = {}
colors["text"] = '#808080'

class FMRAnalyzer:
    """
    Klasa do analizy spektrum FMR z pamięcią obliczonych FFT
    """
    
    def __init__(self, m_z, job):
        """
        Inicjalizacja analizatora FMR
        
        Parameters:
        -----------
        m_z : ndarray
            Dane magnetyzacji
        job : object
            Obiekt zawierający parametr t_sampl (krok czasowy)
        """
        self.m_z = m_z
        self.job = job
        self.data = None
        self.freq = None
        self.freq_ghz = None
        self.fmr_method1 = None
        self.fmr_method2 = None
        self._is_calculated = False
        
    def calculate_fft_data(self):
        """
        Oblicza dane FFT obiema metodami i zapisuje w pamięci
        """
        # Przygotowanie danych
        self.data = self.m_z[:, -1, ...] - self.m_z[0, -1, ...]
        self.data = self.data - np.average(self.data)
        
        # Obliczanie FFT obiema metodami
        self.fmr_method1 = self._calculate_fft_method1()
        self.fmr_method2 = self._calculate_fft_method2()
        
        # Częstotliwości
        self.freq = np.fft.rfftfreq(self.m_z.shape[0], self.job.t_sampl)
        self.freq_ghz = self.freq / 1e9  # Konwersja na GHz
        
        self._is_calculated = True
        print("FFT obliczone i zapisane w pamięci!")
        print(f"Kształt danych: {self.data.shape}")
        print(f"Liczba punktów częstotliwościowych: {len(self.freq)}")
        
    def _calculate_fft_method1(self):
        """
        Metoda 1: FFT dla każdego punktu przestrzennego, następnie uśrednianie
        """
        # FFT wzdłuż osi czasu (oś 0)
        fft = np.fft.rfft(self.data, axis=0)
        fft = np.abs(fft)
        
        # Sprawdzenie czy ostatnia oś to komponenty (x,y,z)
        if self.data.shape[-1] == 3:
            # Uśrednianie po osiach przestrzennych, zachowując komponenty
            fft = np.average(fft, axis=1)  # Uśrednianie po osi przestrzennej
            return fft  # Zwraca [freq, components]
        else:
            # Standardowe uśrednianie po wszystkich osiach przestrzennych
            fft = np.average(fft, axis=(1, 2))
            return fft

    def _calculate_fft_method2(self):
        """
        Metoda 2: Najpierw uśrednianie przestrzenne, następnie FFT
        """
        # Sprawdzenie czy ostatnia oś to komponenty (x,y,z)
        if self.data.shape[-1] == 3:
            # Uśrednianie po osiach przestrzennych, zachowując komponenty
            avg_data = np.average(self.data, axis=1)  # [time, components]
        else:
            # Standardowe uśrednianie po osiach przestrzennych
            avg_data = np.average(self.data, axis=(1, 2))
            
        # FFT sygnału uśrednionego wzdłuż osi czasu
        fft = np.fft.rfft(avg_data, axis=0)
        fft = np.abs(fft)
        return fft
    
    def _check_calculated(self):
        """Sprawdza czy FFT zostało już obliczone"""
        if not self._is_calculated:
            print("FFT nie zostało jeszcze obliczone. Wywołuję calculate_fft_data()...")
            self.calculate_fft_data()
    
    def plot_spectrum(self, save_path=None, dpi=100, freq_range=None, 
                     log_scale=False, normalize=False):
        """
        Tworzy profesjonalny wykres spektrum FMR porównujący dwie metody obliczania FFT
        
        Parameters:
        -----------
        save_path : str, optional
            Ścieżka do zapisania wykresu
        dpi : int
            Rozdzielczość wykresu
        freq_range : tuple, optional
            Zakres częstotliwości (min_freq, max_freq) w GHz
        log_scale : bool
            Czy użyć skali logarytmicznej dla osi Y
        normalize : bool
            Czy znormalizować spektra do maksimum
        """
        self._check_calculated()
        
        # Sprawdzenie czy mamy komponenty x,y,z
        has_components = len(self.fmr_method1.shape) > 1 and self.fmr_method1.shape[1] == 3
        n_plots = 2 if not has_components else 2
        
        # Przygotowanie danych do wykresu
        fmr1 = self.fmr_method1.copy()
        fmr2 = self.fmr_method2.copy()
        
        if normalize:
            if has_components:
                for i in range(3):
                    fmr1[:, i] = fmr1[:, i] / np.max(fmr1[:, i])
                    fmr2[:, i] = fmr2[:, i] / np.max(fmr2[:, i])
            else:
                fmr1 = fmr1 / np.max(fmr1)
                fmr2 = fmr2 / np.max(fmr2)
        
        # Określenie zakresu częstotliwości
        if freq_range:
            mask = (self.freq_ghz >= freq_range[0]) & (self.freq_ghz <= freq_range[1])
            freq_plot = self.freq_ghz[mask]
            fmr1_plot = fmr1[mask]
            fmr2_plot = fmr2[mask]
        else:
            freq_plot = self.freq_ghz[1:]  # Pomijamy DC
            fmr1_plot = fmr1[1:]
            fmr2_plot = fmr2[1:]
        
        # Tworzenie wykresu
        fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(6, 5))
        fig.suptitle('Spektrum FMR - Porównanie metod obliczania FFT', 
                     fontweight='bold', y=0.95)
        
        # Kolory dla komponenty x,y,z
        if has_components:
            colors_comp = generate_pastel_colors(3)
            labels = ['$M_x

    def plot_comparison(self, save_path=None, dpi=100, freq_range=None, 
                       log_scale=False, normalize=False, show_difference=False):
        """
        Tworzy wykres porównawczy obu metod na jednym panelu
        
        Parameters:
        -----------
        save_path : str, optional
            Ścieżka do zapisania wykresu
        dpi : int
            Rozdzielczość wykresu
        freq_range : tuple, optional
            Zakres częstotliwości (min_freq, max_freq) w GHz
        log_scale : bool
            Czy użyć skali logarytmicznej dla osi Y
        normalize : bool
            Czy znormalizować spektra do maksimum
        show_difference : bool
            Czy pokazać różnicę między metodami
        """
        self._check_calculated()
        
        # Sprawdzenie czy mamy komponenty x,y,z
        has_components = len(self.fmr_method1.shape) > 1 and self.fmr_method1.shape[1] == 3
        
        # Przygotowanie danych do wykresu
        fmr1 = self.fmr_method1.copy()
        fmr2 = self.fmr_method2.copy()
        
        if normalize:
            if has_components:
                for i in range(3):
                    fmr1[:, i] = fmr1[:, i] / np.max(fmr1[:, i])
                    fmr2[:, i] = fmr2[:, i] / np.max(fmr2[:, i])
            else:
                fmr1 = fmr1 / np.max(fmr1)
                fmr2 = fmr2 / np.max(fmr2)
        
        # Określenie zakresu częstotliwości
        if freq_range:
            mask = (self.freq_ghz >= freq_range[0]) & (self.freq_ghz <= freq_range[1])
            freq_plot = self.freq_ghz[mask]
            fmr1_plot = fmr1[mask]
            fmr2_plot = fmr2[mask]
        else:
            freq_plot = self.freq_ghz[1:]  # Pomijamy DC
            fmr1_plot = fmr1[1:]
            fmr2_plot = fmr2[1:]
        
        # Tworzenie wykresu
        if show_difference:
            fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(6, 5))
        else:
            fig, ax1 = plt.subplots(figsize=(6, 4))
        
        # Kolory i etykiety
        if has_components:
            colors_comp = generate_pastel_colors(3)
            labels = ['$M_x
    
    def get_peak_frequencies(self, method=1, prominence=0.1, freq_range=None):
        """
        Znajduje częstotliwości pików w spektrum
        
        Parameters:
        -----------
        method : int
            Która metoda (1 lub 2)
        prominence : float
            Minimalna prominencja piku
        freq_range : tuple, optional
            Zakres częstotliwości do analizy
            
        Returns:
        --------
        peaks_freq : array
            Częstotliwości pików w GHz
        peaks_amp : array
            Amplitudy pików
        """
        self._check_calculated()
        from scipy.signal import find_peaks
        
        fmr_data = self.fmr_method1 if method == 1 else self.fmr_method2
        
        if freq_range:
            mask = (self.freq_ghz >= freq_range[0]) & (self.freq_ghz <= freq_range[1])
            freq_search = self.freq_ghz[mask]
            fmr_search = fmr_data[mask]
        else:
            freq_search = self.freq_ghz[1:]  # Pomijamy DC
            fmr_search = fmr_data[1:]
        
        # Znajdź piki
        peaks, properties = find_peaks(fmr_search, prominence=prominence*np.max(fmr_search))
        
        peaks_freq = freq_search[peaks]
        peaks_amp = fmr_search[peaks]
        
        print(f"Znalezione piki (Metoda {method}):")
        for i, (freq, amp) in enumerate(zip(peaks_freq, peaks_amp)):
            print(f"  Pik {i+1}: {freq:.3f} GHz, amplituda: {amp:.2e}")
        
        return peaks_freq, peaks_amp
    
    def export_data(self, filename):
        """
        Eksportuje dane spektrum do pliku CSV
        """
        self._check_calculated()
        
        data_export = np.column_stack([
            self.freq_ghz,
            self.fmr_method1,
            self.fmr_method2
        ])
        
        header = "Frequency_GHz,FFT_then_Average,Average_then_FFT"
        np.savetxt(filename, data_export, delimiter=',', header=header, comments='')
        print(f"Dane wyeksportowane do: {filename}")

# Przykład użycia:
"""
# Inicjalizacja analizatora
analyzer = FMRAnalyzer(m_z, job)

# Obliczenie FFT (tylko raz!)
analyzer.calculate_fft_data()

# Różne wykresy bez ponownego obliczania FFT
analyzer.plot_spectrum(save_path='fmr_spectrum.png')
analyzer.plot_comparison(save_path='fmr_comparison.png')
analyzer.plot_comparison(freq_range=(0, 50), log_scale=True, normalize=True)
analyzer.plot_comparison(show_difference=True)

# Analiza pików
peaks_freq, peaks_amp = analyzer.get_peak_frequencies(method=1, prominence=0.1)

# Eksport danych
analyzer.export_data('fmr_data.csv')
""", '$M_y

    def plot_comparison(self, save_path=None, dpi=300, freq_range=None, 
                       log_scale=False, normalize=False, show_difference=False):
        """
        Tworzy wykres porównawczy obu metod na jednym panelu
        
        Parameters:
        -----------
        save_path : str, optional
            Ścieżka do zapisania wykresu
        dpi : int
            Rozdzielczość wykresu
        freq_range : tuple, optional
            Zakres częstotliwości (min_freq, max_freq) w GHz
        log_scale : bool
            Czy użyć skali logarytmicznej dla osi Y
        normalize : bool
            Czy znormalizować spektra do maksimum
        show_difference : bool
            Czy pokazać różnicę między metodami
        """
        self._check_calculated()
        
        # Przygotowanie danych do wykresu
        fmr1 = self.fmr_method1.copy()
        fmr2 = self.fmr_method2.copy()
        
        if normalize:
            fmr1 = fmr1 / np.max(fmr1)
            fmr2 = fmr2 / np.max(fmr2)
        
        # Określenie zakresu częstotliwości
        if freq_range:
            mask = (self.freq_ghz >= freq_range[0]) & (self.freq_ghz <= freq_range[1])
            freq_plot = self.freq_ghz[mask]
            fmr1_plot = fmr1[mask]
            fmr2_plot = fmr2[mask]
        else:
            freq_plot = self.freq_ghz[1:]  # Pomijamy DC
            fmr1_plot = fmr1[1:]
            fmr2_plot = fmr2[1:]
        
        # Tworzenie wykresu
        if show_difference:
            fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 10))
        else:
            fig, ax1 = plt.subplots(figsize=(12, 8))
        
        # Wykresy obu metod
        ax1.plot(freq_plot, fmr1_plot, 'b-', linewidth=2.5, alpha=0.8,
                label='Metoda 1: FFT → Uśrednianie')
        ax1.plot(freq_plot, fmr2_plot, 'r--', linewidth=2.5, alpha=0.8,
                label='Metoda 2: Uśrednianie → FFT')
        
        ax1.set_xlabel('Częstotliwość [GHz]', fontweight='bold')
        ylabel = 'Amplituda FFT [znorm.]' if normalize else 'Amplituda FFT [a.u.]'
        ax1.set_ylabel(ylabel, fontweight='bold')
        ax1.set_title('Porównanie spektrów FMR - Dwie metody obliczania FFT', 
                     fontweight='bold', fontsize=16, pad=20)
        
        ax1.grid(True, alpha=0.3)
        ax1.legend(frameon=True, fancybox=True, shadow=True, loc='upper right')
        
        if log_scale:
            ax1.set_yscale('log')
        else:
            ax1.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))
        
        # Wykres różnicy (jeśli wymagany)
        if show_difference:
            difference = fmr1_plot - fmr2_plot
            ax2.plot(freq_plot, difference, 'g-', linewidth=2, alpha=0.8)
            ax2.set_xlabel('Częstotliwość [GHz]', fontweight='bold')
            ax2.set_ylabel('Różnica [Metoda 1 - Metoda 2]', fontweight='bold')
            ax2.set_title('Różnica między metodami', fontweight='bold', pad=15)
            ax2.grid(True, alpha=0.3)
            ax2.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))
        
        # Dodanie informacji
        info_text = f'Δt = {self.job.t_sampl:.2e} s | Δf = {self.freq_ghz[1]:.3f} GHz | N = {self.m_z.shape[0]} pts'
        if freq_range:
            info_text += f' | Zakres: {freq_range[0]:.1f}-{freq_range[1]:.1f} GHz'
        
        ax1.text(0.02, 0.98, info_text, transform=ax1.transAxes, fontsize=11,
                verticalalignment='top', 
                bbox=dict(boxstyle="round,pad=0.3", facecolor="white", alpha=0.8))
        
        plt.tight_layout()
        
        if save_path:
            plt.savefig(save_path, dpi=dpi, bbox_inches='tight')
            print(f"Wykres porównawczy zapisany jako: {save_path}")
        
        plt.show()
        
        return fig, ax1 if not show_difference else (fig, ax1, ax2)
    
    def get_peak_frequencies(self, method=1, prominence=0.1, freq_range=None):
        """
        Znajduje częstotliwości pików w spektrum
        
        Parameters:
        -----------
        method : int
            Która metoda (1 lub 2)
        prominence : float
            Minimalna prominencja piku
        freq_range : tuple, optional
            Zakres częstotliwości do analizy
            
        Returns:
        --------
        peaks_freq : array
            Częstotliwości pików w GHz
        peaks_amp : array
            Amplitudy pików
        """
        self._check_calculated()
        from scipy.signal import find_peaks
        
        fmr_data = self.fmr_method1 if method == 1 else self.fmr_method2
        
        if freq_range:
            mask = (self.freq_ghz >= freq_range[0]) & (self.freq_ghz <= freq_range[1])
            freq_search = self.freq_ghz[mask]
            fmr_search = fmr_data[mask]
        else:
            freq_search = self.freq_ghz[1:]  # Pomijamy DC
            fmr_search = fmr_data[1:]
        
        # Znajdź piki
        peaks, properties = find_peaks(fmr_search, prominence=prominence*np.max(fmr_search))
        
        peaks_freq = freq_search[peaks]
        peaks_amp = fmr_search[peaks]
        
        print(f"Znalezione piki (Metoda {method}):")
        for i, (freq, amp) in enumerate(zip(peaks_freq, peaks_amp)):
            print(f"  Pik {i+1}: {freq:.3f} GHz, amplituda: {amp:.2e}")
        
        return peaks_freq, peaks_amp
    
    def export_data(self, filename):
        """
        Eksportuje dane spektrum do pliku CSV
        """
        self._check_calculated()
        
        data_export = np.column_stack([
            self.freq_ghz,
            self.fmr_method1,
            self.fmr_method2
        ])
        
        header = "Frequency_GHz,FFT_then_Average,Average_then_FFT"
        np.savetxt(filename, data_export, delimiter=',', header=header, comments='')
        print(f"Dane wyeksportowane do: {filename}")

# Przykład użycia:
"""
# Inicjalizacja analizatora
analyzer = FMRAnalyzer(m_z, job)

# Obliczenie FFT (tylko raz!)
analyzer.calculate_fft_data()

# Różne wykresy bez ponownego obliczania FFT
analyzer.plot_spectrum(save_path='fmr_spectrum.png')
analyzer.plot_comparison(save_path='fmr_comparison.png')
analyzer.plot_comparison(freq_range=(0, 50), log_scale=True, normalize=True)
analyzer.plot_comparison(show_difference=True)

# Analiza pików
peaks_freq, peaks_amp = analyzer.get_peak_frequencies(method=1, prominence=0.1)

# Eksport danych
analyzer.export_data('fmr_data.csv')
""", '$M_z

    def plot_comparison(self, save_path=None, dpi=300, freq_range=None, 
                       log_scale=False, normalize=False, show_difference=False):
        """
        Tworzy wykres porównawczy obu metod na jednym panelu
        
        Parameters:
        -----------
        save_path : str, optional
            Ścieżka do zapisania wykresu
        dpi : int
            Rozdzielczość wykresu
        freq_range : tuple, optional
            Zakres częstotliwości (min_freq, max_freq) w GHz
        log_scale : bool
            Czy użyć skali logarytmicznej dla osi Y
        normalize : bool
            Czy znormalizować spektra do maksimum
        show_difference : bool
            Czy pokazać różnicę między metodami
        """
        self._check_calculated()
        
        # Przygotowanie danych do wykresu
        fmr1 = self.fmr_method1.copy()
        fmr2 = self.fmr_method2.copy()
        
        if normalize:
            fmr1 = fmr1 / np.max(fmr1)
            fmr2 = fmr2 / np.max(fmr2)
        
        # Określenie zakresu częstotliwości
        if freq_range:
            mask = (self.freq_ghz >= freq_range[0]) & (self.freq_ghz <= freq_range[1])
            freq_plot = self.freq_ghz[mask]
            fmr1_plot = fmr1[mask]
            fmr2_plot = fmr2[mask]
        else:
            freq_plot = self.freq_ghz[1:]  # Pomijamy DC
            fmr1_plot = fmr1[1:]
            fmr2_plot = fmr2[1:]
        
        # Tworzenie wykresu
        if show_difference:
            fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 10))
        else:
            fig, ax1 = plt.subplots(figsize=(12, 8))
        
        # Wykresy obu metod
        ax1.plot(freq_plot, fmr1_plot, 'b-', linewidth=2.5, alpha=0.8,
                label='Metoda 1: FFT → Uśrednianie')
        ax1.plot(freq_plot, fmr2_plot, 'r--', linewidth=2.5, alpha=0.8,
                label='Metoda 2: Uśrednianie → FFT')
        
        ax1.set_xlabel('Częstotliwość [GHz]', fontweight='bold')
        ylabel = 'Amplituda FFT [znorm.]' if normalize else 'Amplituda FFT [a.u.]'
        ax1.set_ylabel(ylabel, fontweight='bold')
        ax1.set_title('Porównanie spektrów FMR - Dwie metody obliczania FFT', 
                     fontweight='bold', fontsize=16, pad=20)
        
        ax1.grid(True, alpha=0.3)
        ax1.legend(frameon=True, fancybox=True, shadow=True, loc='upper right')
        
        if log_scale:
            ax1.set_yscale('log')
        else:
            ax1.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))
        
        # Wykres różnicy (jeśli wymagany)
        if show_difference:
            difference = fmr1_plot - fmr2_plot
            ax2.plot(freq_plot, difference, 'g-', linewidth=2, alpha=0.8)
            ax2.set_xlabel('Częstotliwość [GHz]', fontweight='bold')
            ax2.set_ylabel('Różnica [Metoda 1 - Metoda 2]', fontweight='bold')
            ax2.set_title('Różnica między metodami', fontweight='bold', pad=15)
            ax2.grid(True, alpha=0.3)
            ax2.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))
        
        # Dodanie informacji
        info_text = f'Δt = {self.job.t_sampl:.2e} s | Δf = {self.freq_ghz[1]:.3f} GHz | N = {self.m_z.shape[0]} pts'
        if freq_range:
            info_text += f' | Zakres: {freq_range[0]:.1f}-{freq_range[1]:.1f} GHz'
        
        ax1.text(0.02, 0.98, info_text, transform=ax1.transAxes, fontsize=11,
                verticalalignment='top', 
                bbox=dict(boxstyle="round,pad=0.3", facecolor="white", alpha=0.8))
        
        plt.tight_layout()
        
        if save_path:
            plt.savefig(save_path, dpi=dpi, bbox_inches='tight')
            print(f"Wykres porównawczy zapisany jako: {save_path}")
        
        plt.show()
        
        return fig, ax1 if not show_difference else (fig, ax1, ax2)
    
    def get_peak_frequencies(self, method=1, prominence=0.1, freq_range=None):
        """
        Znajduje częstotliwości pików w spektrum
        
        Parameters:
        -----------
        method : int
            Która metoda (1 lub 2)
        prominence : float
            Minimalna prominencja piku
        freq_range : tuple, optional
            Zakres częstotliwości do analizy
            
        Returns:
        --------
        peaks_freq : array
            Częstotliwości pików w GHz
        peaks_amp : array
            Amplitudy pików
        """
        self._check_calculated()
        from scipy.signal import find_peaks
        
        fmr_data = self.fmr_method1 if method == 1 else self.fmr_method2
        
        if freq_range:
            mask = (self.freq_ghz >= freq_range[0]) & (self.freq_ghz <= freq_range[1])
            freq_search = self.freq_ghz[mask]
            fmr_search = fmr_data[mask]
        else:
            freq_search = self.freq_ghz[1:]  # Pomijamy DC
            fmr_search = fmr_data[1:]
        
        # Znajdź piki
        peaks, properties = find_peaks(fmr_search, prominence=prominence*np.max(fmr_search))
        
        peaks_freq = freq_search[peaks]
        peaks_amp = fmr_search[peaks]
        
        print(f"Znalezione piki (Metoda {method}):")
        for i, (freq, amp) in enumerate(zip(peaks_freq, peaks_amp)):
            print(f"  Pik {i+1}: {freq:.3f} GHz, amplituda: {amp:.2e}")
        
        return peaks_freq, peaks_amp
    
    def export_data(self, filename):
        """
        Eksportuje dane spektrum do pliku CSV
        """
        self._check_calculated()
        
        data_export = np.column_stack([
            self.freq_ghz,
            self.fmr_method1,
            self.fmr_method2
        ])
        
        header = "Frequency_GHz,FFT_then_Average,Average_then_FFT"
        np.savetxt(filename, data_export, delimiter=',', header=header, comments='')
        print(f"Dane wyeksportowane do: {filename}")

# Przykład użycia:
"""
# Inicjalizacja analizatora
analyzer = FMRAnalyzer(m_z, job)

# Obliczenie FFT (tylko raz!)
analyzer.calculate_fft_data()

# Różne wykresy bez ponownego obliczania FFT
analyzer.plot_spectrum(save_path='fmr_spectrum.png')
analyzer.plot_comparison(save_path='fmr_comparison.png')
analyzer.plot_comparison(freq_range=(0, 50), log_scale=True, normalize=True)
analyzer.plot_comparison(show_difference=True)

# Analiza pików
peaks_freq, peaks_amp = analyzer.get_peak_frequencies(method=1, prominence=0.1)

# Eksport danych
analyzer.export_data('fmr_data.csv')
"""]
            
            # Wykres 1: Metoda 1
            for i in range(3):
                data_plot = fmr1_plot[:, i] if has_components else fmr1_plot
                ax1.plot(freq_plot, data_plot, color=colors_comp[i], 
                        linewidth=2, alpha=0.8, label=labels[i])
                
            # Wykres 2: Metoda 2  
            for i in range(3):
                data_plot = fmr2_plot[:, i] if has_components else fmr2_plot
                ax2.plot(freq_plot, data_plot, color=colors_comp[i], 
                        linewidth=2, alpha=0.8, label=labels[i])
        else:
            # Pojedyncze krzywe
            ax1.plot(freq_plot, fmr1_plot, color=generate_pastel_colors(1)[0], 
                    linewidth=2, alpha=0.8, label='FFT → Uśrednianie')
            ax2.plot(freq_plot, fmr2_plot, color=generate_pastel_colors(1)[0], 
                    linewidth=2, alpha=0.8, label='Uśrednianie → FFT')
        
        # Formatowanie osi i etykiet
        for ax, title in zip([ax1, ax2], 
                           ['Metoda 1: FFT dla każdego punktu, następnie uśrednianie',
                            'Metoda 2: Uśrednianie przestrzenne, następnie FFT']):
            ax.set_xlabel('Częstotliwość [GHz]')
            ylabel = 'Amplituda FFT [znorm.]' if normalize else 'Amplituda FFT [a.u.]'
            ax.set_ylabel(ylabel)
            ax.set_title(title, fontweight='bold', pad=15)
            ax.grid(True, alpha=0.3)
            ax.legend(frameon=True, fancybox=True, shadow=True)
            
            if log_scale:
                ax.set_yscale('log')
            else:
                ax.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))
        
        # Dodanie informacji o parametrach
        info_text = f'Krok czasowy: {self.job.t_sampl:.2e} s\n'
        info_text += f'Rozdzielczość częstotliwościowa: {self.freq_ghz[1]:.3f} GHz\n'
        info_text += f'Liczba punktów czasowych: {self.m_z.shape[0]}\n'
        if freq_range:
            info_text += f'Zakres częstotliwości: {freq_range[0]:.1f} - {freq_range[1]:.1f} GHz'
        
        fig.text(0.02, 0.02, info_text, fontsize=8, 
                 bbox=dict(boxstyle="round,pad=0.3", facecolor="lightgray", alpha=0.7))
        
        plt.tight_layout()
        plt.subplots_adjust(top=0.92, bottom=0.12)
        
        if save_path:
            plt.savefig(save_path, dpi=dpi, bbox_inches='tight', 
                       facecolor='white', edgecolor='none')
            print(f"Wykres zapisany jako: {save_path}")
        
        plt.show()
        
        return fig, (ax1, ax2)

    def plot_comparison(self, save_path=None, dpi=300, freq_range=None, 
                       log_scale=False, normalize=False, show_difference=False):
        """
        Tworzy wykres porównawczy obu metod na jednym panelu
        
        Parameters:
        -----------
        save_path : str, optional
            Ścieżka do zapisania wykresu
        dpi : int
            Rozdzielczość wykresu
        freq_range : tuple, optional
            Zakres częstotliwości (min_freq, max_freq) w GHz
        log_scale : bool
            Czy użyć skali logarytmicznej dla osi Y
        normalize : bool
            Czy znormalizować spektra do maksimum
        show_difference : bool
            Czy pokazać różnicę między metodami
        """
        self._check_calculated()
        
        # Przygotowanie danych do wykresu
        fmr1 = self.fmr_method1.copy()
        fmr2 = self.fmr_method2.copy()
        
        if normalize:
            fmr1 = fmr1 / np.max(fmr1)
            fmr2 = fmr2 / np.max(fmr2)
        
        # Określenie zakresu częstotliwości
        if freq_range:
            mask = (self.freq_ghz >= freq_range[0]) & (self.freq_ghz <= freq_range[1])
            freq_plot = self.freq_ghz[mask]
            fmr1_plot = fmr1[mask]
            fmr2_plot = fmr2[mask]
        else:
            freq_plot = self.freq_ghz[1:]  # Pomijamy DC
            fmr1_plot = fmr1[1:]
            fmr2_plot = fmr2[1:]
        
        # Tworzenie wykresu
        if show_difference:
            fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 10))
        else:
            fig, ax1 = plt.subplots(figsize=(12, 8))
        
        # Wykresy obu metod
        ax1.plot(freq_plot, fmr1_plot, 'b-', linewidth=2.5, alpha=0.8,
                label='Metoda 1: FFT → Uśrednianie')
        ax1.plot(freq_plot, fmr2_plot, 'r--', linewidth=2.5, alpha=0.8,
                label='Metoda 2: Uśrednianie → FFT')
        
        ax1.set_xlabel('Częstotliwość [GHz]', fontweight='bold')
        ylabel = 'Amplituda FFT [znorm.]' if normalize else 'Amplituda FFT [a.u.]'
        ax1.set_ylabel(ylabel, fontweight='bold')
        ax1.set_title('Porównanie spektrów FMR - Dwie metody obliczania FFT', 
                     fontweight='bold', fontsize=16, pad=20)
        
        ax1.grid(True, alpha=0.3)
        ax1.legend(frameon=True, fancybox=True, shadow=True, loc='upper right')
        
        if log_scale:
            ax1.set_yscale('log')
        else:
            ax1.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))
        
        # Wykres różnicy (jeśli wymagany)
        if show_difference:
            difference = fmr1_plot - fmr2_plot
            ax2.plot(freq_plot, difference, 'g-', linewidth=2, alpha=0.8)
            ax2.set_xlabel('Częstotliwość [GHz]', fontweight='bold')
            ax2.set_ylabel('Różnica [Metoda 1 - Metoda 2]', fontweight='bold')
            ax2.set_title('Różnica między metodami', fontweight='bold', pad=15)
            ax2.grid(True, alpha=0.3)
            ax2.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))
        
        # Dodanie informacji
        info_text = f'Δt = {self.job.t_sampl:.2e} s | Δf = {self.freq_ghz[1]:.3f} GHz | N = {self.m_z.shape[0]} pts'
        if freq_range:
            info_text += f' | Zakres: {freq_range[0]:.1f}-{freq_range[1]:.1f} GHz'
        
        ax1.text(0.02, 0.98, info_text, transform=ax1.transAxes, fontsize=11,
                verticalalignment='top', 
                bbox=dict(boxstyle="round,pad=0.3", facecolor="white", alpha=0.8))
        
        plt.tight_layout()
        
        if save_path:
            plt.savefig(save_path, dpi=dpi, bbox_inches='tight')
            print(f"Wykres porównawczy zapisany jako: {save_path}")
        
        plt.show()
        
        return fig, ax1 if not show_difference else (fig, ax1, ax2)
    
    def get_peak_frequencies(self, method=1, prominence=0.1, freq_range=None):
        """
        Znajduje częstotliwości pików w spektrum
        
        Parameters:
        -----------
        method : int
            Która metoda (1 lub 2)
        prominence : float
            Minimalna prominencja piku
        freq_range : tuple, optional
            Zakres częstotliwości do analizy
            
        Returns:
        --------
        peaks_freq : array
            Częstotliwości pików w GHz
        peaks_amp : array
            Amplitudy pików
        """
        self._check_calculated()
        from scipy.signal import find_peaks
        
        fmr_data = self.fmr_method1 if method == 1 else self.fmr_method2
        
        if freq_range:
            mask = (self.freq_ghz >= freq_range[0]) & (self.freq_ghz <= freq_range[1])
            freq_search = self.freq_ghz[mask]
            fmr_search = fmr_data[mask]
        else:
            freq_search = self.freq_ghz[1:]  # Pomijamy DC
            fmr_search = fmr_data[1:]
        
        # Znajdź piki
        peaks, properties = find_peaks(fmr_search, prominence=prominence*np.max(fmr_search))
        
        peaks_freq = freq_search[peaks]
        peaks_amp = fmr_search[peaks]
        
        print(f"Znalezione piki (Metoda {method}):")
        for i, (freq, amp) in enumerate(zip(peaks_freq, peaks_amp)):
            print(f"  Pik {i+1}: {freq:.3f} GHz, amplituda: {amp:.2e}")
        
        return peaks_freq, peaks_amp
    
    def export_data(self, filename):
        """
        Eksportuje dane spektrum do pliku CSV
        """
        self._check_calculated()
        
        data_export = np.column_stack([
            self.freq_ghz,
            self.fmr_method1,
            self.fmr_method2
        ])
        
        header = "Frequency_GHz,FFT_then_Average,Average_then_FFT"
        np.savetxt(filename, data_export, delimiter=',', header=header, comments='')
        print(f"Dane wyeksportowane do: {filename}")

# Przykład użycia:
"""
# Inicjalizacja analizatora
analyzer = FMRAnalyzer(m_z, job)

# Obliczenie FFT (tylko raz!)
analyzer.calculate_fft_data()

# Różne wykresy bez ponownego obliczania FFT
analyzer.plot_spectrum(save_path='fmr_spectrum.png')
analyzer.plot_comparison(save_path='fmr_comparison.png')
analyzer.plot_comparison(freq_range=(0, 50), log_scale=True, normalize=True)
analyzer.plot_comparison(show_difference=True)

# Analiza pików
peaks_freq, peaks_amp = analyzer.get_peak_frequencies(method=1, prominence=0.1)

# Eksport danych
analyzer.export_data('fmr_data.csv')
""", '$M_y
    
    def get_peak_frequencies(self, method=1, prominence=0.1, freq_range=None):
        """
        Znajduje częstotliwości pików w spektrum
        
        Parameters:
        -----------
        method : int
            Która metoda (1 lub 2)
        prominence : float
            Minimalna prominencja piku
        freq_range : tuple, optional
            Zakres częstotliwości do analizy
            
        Returns:
        --------
        peaks_freq : array
            Częstotliwości pików w GHz
        peaks_amp : array
            Amplitudy pików
        """
        self._check_calculated()
        from scipy.signal import find_peaks
        
        fmr_data = self.fmr_method1 if method == 1 else self.fmr_method2
        
        if freq_range:
            mask = (self.freq_ghz >= freq_range[0]) & (self.freq_ghz <= freq_range[1])
            freq_search = self.freq_ghz[mask]
            fmr_search = fmr_data[mask]
        else:
            freq_search = self.freq_ghz[1:]  # Pomijamy DC
            fmr_search = fmr_data[1:]
        
        # Znajdź piki
        peaks, properties = find_peaks(fmr_search, prominence=prominence*np.max(fmr_search))
        
        peaks_freq = freq_search[peaks]
        peaks_amp = fmr_search[peaks]
        
        print(f"Znalezione piki (Metoda {method}):")
        for i, (freq, amp) in enumerate(zip(peaks_freq, peaks_amp)):
            print(f"  Pik {i+1}: {freq:.3f} GHz, amplituda: {amp:.2e}")
        
        return peaks_freq, peaks_amp
    
    def export_data(self, filename):
        """
        Eksportuje dane spektrum do pliku CSV
        """
        self._check_calculated()
        
        data_export = np.column_stack([
            self.freq_ghz,
            self.fmr_method1,
            self.fmr_method2
        ])
        
        header = "Frequency_GHz,FFT_then_Average,Average_then_FFT"
        np.savetxt(filename, data_export, delimiter=',', header=header, comments='')
        print(f"Dane wyeksportowane do: {filename}")

# Przykład użycia:
"""
# Inicjalizacja analizatora
analyzer = FMRAnalyzer(m_z, job)

# Obliczenie FFT (tylko raz!)
analyzer.calculate_fft_data()

# Różne wykresy bez ponownego obliczania FFT
analyzer.plot_spectrum(save_path='fmr_spectrum.png')
analyzer.plot_comparison(save_path='fmr_comparison.png')
analyzer.plot_comparison(freq_range=(0, 50), log_scale=True, normalize=True)
analyzer.plot_comparison(show_difference=True)

# Analiza pików
peaks_freq, peaks_amp = analyzer.get_peak_frequencies(method=1, prominence=0.1)

# Eksport danych
analyzer.export_data('fmr_data.csv')
""", '$M_y

    def plot_comparison(self, save_path=None, dpi=300, freq_range=None, 
                       log_scale=False, normalize=False, show_difference=False):
        """
        Tworzy wykres porównawczy obu metod na jednym panelu
        
        Parameters:
        -----------
        save_path : str, optional
            Ścieżka do zapisania wykresu
        dpi : int
            Rozdzielczość wykresu
        freq_range : tuple, optional
            Zakres częstotliwości (min_freq, max_freq) w GHz
        log_scale : bool
            Czy użyć skali logarytmicznej dla osi Y
        normalize : bool
            Czy znormalizować spektra do maksimum
        show_difference : bool
            Czy pokazać różnicę między metodami
        """
        self._check_calculated()
        
        # Przygotowanie danych do wykresu
        fmr1 = self.fmr_method1.copy()
        fmr2 = self.fmr_method2.copy()
        
        if normalize:
            fmr1 = fmr1 / np.max(fmr1)
            fmr2 = fmr2 / np.max(fmr2)
        
        # Określenie zakresu częstotliwości
        if freq_range:
            mask = (self.freq_ghz >= freq_range[0]) & (self.freq_ghz <= freq_range[1])
            freq_plot = self.freq_ghz[mask]
            fmr1_plot = fmr1[mask]
            fmr2_plot = fmr2[mask]
        else:
            freq_plot = self.freq_ghz[1:]  # Pomijamy DC
            fmr1_plot = fmr1[1:]
            fmr2_plot = fmr2[1:]
        
        # Tworzenie wykresu
        if show_difference:
            fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 10))
        else:
            fig, ax1 = plt.subplots(figsize=(12, 8))
        
        # Wykresy obu metod
        ax1.plot(freq_plot, fmr1_plot, 'b-', linewidth=2.5, alpha=0.8,
                label='Metoda 1: FFT → Uśrednianie')
        ax1.plot(freq_plot, fmr2_plot, 'r--', linewidth=2.5, alpha=0.8,
                label='Metoda 2: Uśrednianie → FFT')
        
        ax1.set_xlabel('Częstotliwość [GHz]', fontweight='bold')
        ylabel = 'Amplituda FFT [znorm.]' if normalize else 'Amplituda FFT [a.u.]'
        ax1.set_ylabel(ylabel, fontweight='bold')
        ax1.set_title('Porównanie spektrów FMR - Dwie metody obliczania FFT', 
                     fontweight='bold', fontsize=16, pad=20)
        
        ax1.grid(True, alpha=0.3)
        ax1.legend(frameon=True, fancybox=True, shadow=True, loc='upper right')
        
        if log_scale:
            ax1.set_yscale('log')
        else:
            ax1.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))
        
        # Wykres różnicy (jeśli wymagany)
        if show_difference:
            difference = fmr1_plot - fmr2_plot
            ax2.plot(freq_plot, difference, 'g-', linewidth=2, alpha=0.8)
            ax2.set_xlabel('Częstotliwość [GHz]', fontweight='bold')
            ax2.set_ylabel('Różnica [Metoda 1 - Metoda 2]', fontweight='bold')
            ax2.set_title('Różnica między metodami', fontweight='bold', pad=15)
            ax2.grid(True, alpha=0.3)
            ax2.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))
        
        # Dodanie informacji
        info_text = f'Δt = {self.job.t_sampl:.2e} s | Δf = {self.freq_ghz[1]:.3f} GHz | N = {self.m_z.shape[0]} pts'
        if freq_range:
            info_text += f' | Zakres: {freq_range[0]:.1f}-{freq_range[1]:.1f} GHz'
        
        ax1.text(0.02, 0.98, info_text, transform=ax1.transAxes, fontsize=11,
                verticalalignment='top', 
                bbox=dict(boxstyle="round,pad=0.3", facecolor="white", alpha=0.8))
        
        plt.tight_layout()
        
        if save_path:
            plt.savefig(save_path, dpi=dpi, bbox_inches='tight')
            print(f"Wykres porównawczy zapisany jako: {save_path}")
        
        plt.show()
        
        return fig, ax1 if not show_difference else (fig, ax1, ax2)
    
    def get_peak_frequencies(self, method=1, prominence=0.1, freq_range=None):
        """
        Znajduje częstotliwości pików w spektrum
        
        Parameters:
        -----------
        method : int
            Która metoda (1 lub 2)
        prominence : float
            Minimalna prominencja piku
        freq_range : tuple, optional
            Zakres częstotliwości do analizy
            
        Returns:
        --------
        peaks_freq : array
            Częstotliwości pików w GHz
        peaks_amp : array
            Amplitudy pików
        """
        self._check_calculated()
        from scipy.signal import find_peaks
        
        fmr_data = self.fmr_method1 if method == 1 else self.fmr_method2
        
        if freq_range:
            mask = (self.freq_ghz >= freq_range[0]) & (self.freq_ghz <= freq_range[1])
            freq_search = self.freq_ghz[mask]
            fmr_search = fmr_data[mask]
        else:
            freq_search = self.freq_ghz[1:]  # Pomijamy DC
            fmr_search = fmr_data[1:]
        
        # Znajdź piki
        peaks, properties = find_peaks(fmr_search, prominence=prominence*np.max(fmr_search))
        
        peaks_freq = freq_search[peaks]
        peaks_amp = fmr_search[peaks]
        
        print(f"Znalezione piki (Metoda {method}):")
        for i, (freq, amp) in enumerate(zip(peaks_freq, peaks_amp)):
            print(f"  Pik {i+1}: {freq:.3f} GHz, amplituda: {amp:.2e}")
        
        return peaks_freq, peaks_amp
    
    def export_data(self, filename):
        """
        Eksportuje dane spektrum do pliku CSV
        """
        self._check_calculated()
        
        data_export = np.column_stack([
            self.freq_ghz,
            self.fmr_method1,
            self.fmr_method2
        ])
        
        header = "Frequency_GHz,FFT_then_Average,Average_then_FFT"
        np.savetxt(filename, data_export, delimiter=',', header=header, comments='')
        print(f"Dane wyeksportowane do: {filename}")

# Przykład użycia:
"""
# Inicjalizacja analizatora
analyzer = FMRAnalyzer(m_z, job)

# Obliczenie FFT (tylko raz!)
analyzer.calculate_fft_data()

# Różne wykresy bez ponownego obliczania FFT
analyzer.plot_spectrum(save_path='fmr_spectrum.png')
analyzer.plot_comparison(save_path='fmr_comparison.png')
analyzer.plot_comparison(freq_range=(0, 50), log_scale=True, normalize=True)
analyzer.plot_comparison(show_difference=True)

# Analiza pików
peaks_freq, peaks_amp = analyzer.get_peak_frequencies(method=1, prominence=0.1)

# Eksport danych
analyzer.export_data('fmr_data.csv')
""", '$M_z

    def plot_comparison(self, save_path=None, dpi=300, freq_range=None, 
                       log_scale=False, normalize=False, show_difference=False):
        """
        Tworzy wykres porównawczy obu metod na jednym panelu
        
        Parameters:
        -----------
        save_path : str, optional
            Ścieżka do zapisania wykresu
        dpi : int
            Rozdzielczość wykresu
        freq_range : tuple, optional
            Zakres częstotliwości (min_freq, max_freq) w GHz
        log_scale : bool
            Czy użyć skali logarytmicznej dla osi Y
        normalize : bool
            Czy znormalizować spektra do maksimum
        show_difference : bool
            Czy pokazać różnicę między metodami
        """
        self._check_calculated()
        
        # Przygotowanie danych do wykresu
        fmr1 = self.fmr_method1.copy()
        fmr2 = self.fmr_method2.copy()
        
        if normalize:
            fmr1 = fmr1 / np.max(fmr1)
            fmr2 = fmr2 / np.max(fmr2)
        
        # Określenie zakresu częstotliwości
        if freq_range:
            mask = (self.freq_ghz >= freq_range[0]) & (self.freq_ghz <= freq_range[1])
            freq_plot = self.freq_ghz[mask]
            fmr1_plot = fmr1[mask]
            fmr2_plot = fmr2[mask]
        else:
            freq_plot = self.freq_ghz[1:]  # Pomijamy DC
            fmr1_plot = fmr1[1:]
            fmr2_plot = fmr2[1:]
        
        # Tworzenie wykresu
        if show_difference:
            fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 10))
        else:
            fig, ax1 = plt.subplots(figsize=(12, 8))
        
        # Wykresy obu metod
        ax1.plot(freq_plot, fmr1_plot, 'b-', linewidth=2.5, alpha=0.8,
                label='Metoda 1: FFT → Uśrednianie')
        ax1.plot(freq_plot, fmr2_plot, 'r--', linewidth=2.5, alpha=0.8,
                label='Metoda 2: Uśrednianie → FFT')
        
        ax1.set_xlabel('Częstotliwość [GHz]', fontweight='bold')
        ylabel = 'Amplituda FFT [znorm.]' if normalize else 'Amplituda FFT [a.u.]'
        ax1.set_ylabel(ylabel, fontweight='bold')
        ax1.set_title('Porównanie spektrów FMR - Dwie metody obliczania FFT', 
                     fontweight='bold', fontsize=16, pad=20)
        
        ax1.grid(True, alpha=0.3)
        ax1.legend(frameon=True, fancybox=True, shadow=True, loc='upper right')
        
        if log_scale:
            ax1.set_yscale('log')
        else:
            ax1.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))
        
        # Wykres różnicy (jeśli wymagany)
        if show_difference:
            difference = fmr1_plot - fmr2_plot
            ax2.plot(freq_plot, difference, 'g-', linewidth=2, alpha=0.8)
            ax2.set_xlabel('Częstotliwość [GHz]', fontweight='bold')
            ax2.set_ylabel('Różnica [Metoda 1 - Metoda 2]', fontweight='bold')
            ax2.set_title('Różnica między metodami', fontweight='bold', pad=15)
            ax2.grid(True, alpha=0.3)
            ax2.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))
        
        # Dodanie informacji
        info_text = f'Δt = {self.job.t_sampl:.2e} s | Δf = {self.freq_ghz[1]:.3f} GHz | N = {self.m_z.shape[0]} pts'
        if freq_range:
            info_text += f' | Zakres: {freq_range[0]:.1f}-{freq_range[1]:.1f} GHz'
        
        ax1.text(0.02, 0.98, info_text, transform=ax1.transAxes, fontsize=11,
                verticalalignment='top', 
                bbox=dict(boxstyle="round,pad=0.3", facecolor="white", alpha=0.8))
        
        plt.tight_layout()
        
        if save_path:
            plt.savefig(save_path, dpi=dpi, bbox_inches='tight')
            print(f"Wykres porównawczy zapisany jako: {save_path}")
        
        plt.show()
        
        return fig, ax1 if not show_difference else (fig, ax1, ax2)
    
    def get_peak_frequencies(self, method=1, prominence=0.1, freq_range=None):
        """
        Znajduje częstotliwości pików w spektrum
        
        Parameters:
        -----------
        method : int
            Która metoda (1 lub 2)
        prominence : float
            Minimalna prominencja piku
        freq_range : tuple, optional
            Zakres częstotliwości do analizy
            
        Returns:
        --------
        peaks_freq : array
            Częstotliwości pików w GHz
        peaks_amp : array
            Amplitudy pików
        """
        self._check_calculated()
        from scipy.signal import find_peaks
        
        fmr_data = self.fmr_method1 if method == 1 else self.fmr_method2
        
        if freq_range:
            mask = (self.freq_ghz >= freq_range[0]) & (self.freq_ghz <= freq_range[1])
            freq_search = self.freq_ghz[mask]
            fmr_search = fmr_data[mask]
        else:
            freq_search = self.freq_ghz[1:]  # Pomijamy DC
            fmr_search = fmr_data[1:]
        
        # Znajdź piki
        peaks, properties = find_peaks(fmr_search, prominence=prominence*np.max(fmr_search))
        
        peaks_freq = freq_search[peaks]
        peaks_amp = fmr_search[peaks]
        
        print(f"Znalezione piki (Metoda {method}):")
        for i, (freq, amp) in enumerate(zip(peaks_freq, peaks_amp)):
            print(f"  Pik {i+1}: {freq:.3f} GHz, amplituda: {amp:.2e}")
        
        return peaks_freq, peaks_amp
    
    def export_data(self, filename):
        """
        Eksportuje dane spektrum do pliku CSV
        """
        self._check_calculated()
        
        data_export = np.column_stack([
            self.freq_ghz,
            self.fmr_method1,
            self.fmr_method2
        ])
        
        header = "Frequency_GHz,FFT_then_Average,Average_then_FFT"
        np.savetxt(filename, data_export, delimiter=',', header=header, comments='')
        print(f"Dane wyeksportowane do: {filename}")

# Przykład użycia:
"""
# Inicjalizacja analizatora
analyzer = FMRAnalyzer(m_z, job)

# Obliczenie FFT (tylko raz!)
analyzer.calculate_fft_data()

# Różne wykresy bez ponownego obliczania FFT
analyzer.plot_spectrum(save_path='fmr_spectrum.png')
analyzer.plot_comparison(save_path='fmr_comparison.png')
analyzer.plot_comparison(freq_range=(0, 50), log_scale=True, normalize=True)
analyzer.plot_comparison(show_difference=True)

# Analiza pików
peaks_freq, peaks_amp = analyzer.get_peak_frequencies(method=1, prominence=0.1)

# Eksport danych
analyzer.export_data('fmr_data.csv')
"""]
            
            # Wykres 1: Metoda 1
            for i in range(3):
                data_plot = fmr1_plot[:, i] if has_components else fmr1_plot
                ax1.plot(freq_plot, data_plot, color=colors_comp[i], 
                        linewidth=2, alpha=0.8, label=labels[i])
                
            # Wykres 2: Metoda 2  
            for i in range(3):
                data_plot = fmr2_plot[:, i] if has_components else fmr2_plot
                ax2.plot(freq_plot, data_plot, color=colors_comp[i], 
                        linewidth=2, alpha=0.8, label=labels[i])
        else:
            # Pojedyncze krzywe
            ax1.plot(freq_plot, fmr1_plot, color=generate_pastel_colors(1)[0], 
                    linewidth=2, alpha=0.8, label='FFT → Uśrednianie')
            ax2.plot(freq_plot, fmr2_plot, color=generate_pastel_colors(1)[0], 
                    linewidth=2, alpha=0.8, label='Uśrednianie → FFT')
        
        # Formatowanie osi i etykiet
        for ax, title in zip([ax1, ax2], 
                           ['Metoda 1: FFT dla każdego punktu, następnie uśrednianie',
                            'Metoda 2: Uśrednianie przestrzenne, następnie FFT']):
            ax.set_xlabel('Częstotliwość [GHz]')
            ylabel = 'Amplituda FFT [znorm.]' if normalize else 'Amplituda FFT [a.u.]'
            ax.set_ylabel(ylabel)
            ax.set_title(title, fontweight='bold', pad=15)
            ax.grid(True, alpha=0.3)
            ax.legend(frameon=True, fancybox=True, shadow=True)
            
            if log_scale:
                ax.set_yscale('log')
            else:
                ax.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))
        
        # Dodanie informacji o parametrach
        info_text = f'Krok czasowy: {self.job.t_sampl:.2e} s\n'
        info_text += f'Rozdzielczość częstotliwościowa: {self.freq_ghz[1]:.3f} GHz\n'
        info_text += f'Liczba punktów czasowych: {self.m_z.shape[0]}\n'
        if freq_range:
            info_text += f'Zakres częstotliwości: {freq_range[0]:.1f} - {freq_range[1]:.1f} GHz'
        
        fig.text(0.02, 0.02, info_text, fontsize=8, 
                 bbox=dict(boxstyle="round,pad=0.3", facecolor="lightgray", alpha=0.7))
        
        plt.tight_layout()
        plt.subplots_adjust(top=0.92, bottom=0.12)
        
        if save_path:
            plt.savefig(save_path, dpi=dpi, bbox_inches='tight', 
                       facecolor='white', edgecolor='none')
            print(f"Wykres zapisany jako: {save_path}")
        
        plt.show()
        
        return fig, (ax1, ax2)

    def plot_comparison(self, save_path=None, dpi=300, freq_range=None, 
                       log_scale=False, normalize=False, show_difference=False):
        """
        Tworzy wykres porównawczy obu metod na jednym panelu
        
        Parameters:
        -----------
        save_path : str, optional
            Ścieżka do zapisania wykresu
        dpi : int
            Rozdzielczość wykresu
        freq_range : tuple, optional
            Zakres częstotliwości (min_freq, max_freq) w GHz
        log_scale : bool
            Czy użyć skali logarytmicznej dla osi Y
        normalize : bool
            Czy znormalizować spektra do maksimum
        show_difference : bool
            Czy pokazać różnicę między metodami
        """
        self._check_calculated()
        
        # Przygotowanie danych do wykresu
        fmr1 = self.fmr_method1.copy()
        fmr2 = self.fmr_method2.copy()
        
        if normalize:
            fmr1 = fmr1 / np.max(fmr1)
            fmr2 = fmr2 / np.max(fmr2)
        
        # Określenie zakresu częstotliwości
        if freq_range:
            mask = (self.freq_ghz >= freq_range[0]) & (self.freq_ghz <= freq_range[1])
            freq_plot = self.freq_ghz[mask]
            fmr1_plot = fmr1[mask]
            fmr2_plot = fmr2[mask]
        else:
            freq_plot = self.freq_ghz[1:]  # Pomijamy DC
            fmr1_plot = fmr1[1:]
            fmr2_plot = fmr2[1:]
        
        # Tworzenie wykresu
        if show_difference:
            fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 10))
        else:
            fig, ax1 = plt.subplots(figsize=(12, 8))
        
        # Wykresy obu metod
        ax1.plot(freq_plot, fmr1_plot, 'b-', linewidth=2.5, alpha=0.8,
                label='Metoda 1: FFT → Uśrednianie')
        ax1.plot(freq_plot, fmr2_plot, 'r--', linewidth=2.5, alpha=0.8,
                label='Metoda 2: Uśrednianie → FFT')
        
        ax1.set_xlabel('Częstotliwość [GHz]', fontweight='bold')
        ylabel = 'Amplituda FFT [znorm.]' if normalize else 'Amplituda FFT [a.u.]'
        ax1.set_ylabel(ylabel, fontweight='bold')
        ax1.set_title('Porównanie spektrów FMR - Dwie metody obliczania FFT', 
                     fontweight='bold', fontsize=16, pad=20)
        
        ax1.grid(True, alpha=0.3)
        ax1.legend(frameon=True, fancybox=True, shadow=True, loc='upper right')
        
        if log_scale:
            ax1.set_yscale('log')
        else:
            ax1.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))
        
        # Wykres różnicy (jeśli wymagany)
        if show_difference:
            difference = fmr1_plot - fmr2_plot
            ax2.plot(freq_plot, difference, 'g-', linewidth=2, alpha=0.8)
            ax2.set_xlabel('Częstotliwość [GHz]', fontweight='bold')
            ax2.set_ylabel('Różnica [Metoda 1 - Metoda 2]', fontweight='bold')
            ax2.set_title('Różnica między metodami', fontweight='bold', pad=15)
            ax2.grid(True, alpha=0.3)
            ax2.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))
        
        # Dodanie informacji
        info_text = f'Δt = {self.job.t_sampl:.2e} s | Δf = {self.freq_ghz[1]:.3f} GHz | N = {self.m_z.shape[0]} pts'
        if freq_range:
            info_text += f' | Zakres: {freq_range[0]:.1f}-{freq_range[1]:.1f} GHz'
        
        ax1.text(0.02, 0.98, info_text, transform=ax1.transAxes, fontsize=11,
                verticalalignment='top', 
                bbox=dict(boxstyle="round,pad=0.3", facecolor="white", alpha=0.8))
        
        plt.tight_layout()
        
        if save_path:
            plt.savefig(save_path, dpi=dpi, bbox_inches='tight')
            print(f"Wykres porównawczy zapisany jako: {save_path}")
        
        plt.show()
        
        return fig, ax1 if not show_difference else (fig, ax1, ax2)
    
    def get_peak_frequencies(self, method=1, prominence=0.1, freq_range=None):
        """
        Znajduje częstotliwości pików w spektrum
        
        Parameters:
        -----------
        method : int
            Która metoda (1 lub 2)
        prominence : float
            Minimalna prominencja piku
        freq_range : tuple, optional
            Zakres częstotliwości do analizy
            
        Returns:
        --------
        peaks_freq : array
            Częstotliwości pików w GHz
        peaks_amp : array
            Amplitudy pików
        """
        self._check_calculated()
        from scipy.signal import find_peaks
        
        fmr_data = self.fmr_method1 if method == 1 else self.fmr_method2
        
        if freq_range:
            mask = (self.freq_ghz >= freq_range[0]) & (self.freq_ghz <= freq_range[1])
            freq_search = self.freq_ghz[mask]
            fmr_search = fmr_data[mask]
        else:
            freq_search = self.freq_ghz[1:]  # Pomijamy DC
            fmr_search = fmr_data[1:]
        
        # Znajdź piki
        peaks, properties = find_peaks(fmr_search, prominence=prominence*np.max(fmr_search))
        
        peaks_freq = freq_search[peaks]
        peaks_amp = fmr_search[peaks]
        
        print(f"Znalezione piki (Metoda {method}):")
        for i, (freq, amp) in enumerate(zip(peaks_freq, peaks_amp)):
            print(f"  Pik {i+1}: {freq:.3f} GHz, amplituda: {amp:.2e}")
        
        return peaks_freq, peaks_amp
    
    def export_data(self, filename):
        """
        Eksportuje dane spektrum do pliku CSV
        """
        self._check_calculated()
        
        data_export = np.column_stack([
            self.freq_ghz,
            self.fmr_method1,
            self.fmr_method2
        ])
        
        header = "Frequency_GHz,FFT_then_Average,Average_then_FFT"
        np.savetxt(filename, data_export, delimiter=',', header=header, comments='')
        print(f"Dane wyeksportowane do: {filename}")

# Przykład użycia:
"""
# Inicjalizacja analizatora
analyzer = FMRAnalyzer(m_z, job)

# Obliczenie FFT (tylko raz!)
analyzer.calculate_fft_data()

# Różne wykresy bez ponownego obliczania FFT
analyzer.plot_spectrum(save_path='fmr_spectrum.png')
analyzer.plot_comparison(save_path='fmr_comparison.png')
analyzer.plot_comparison(freq_range=(0, 50), log_scale=True, normalize=True)
analyzer.plot_comparison(show_difference=True)

# Analiza pików
peaks_freq, peaks_amp = analyzer.get_peak_frequencies(method=1, prominence=0.1)

# Eksport danych
analyzer.export_data('fmr_data.csv')
""", '$M_z
    
    def get_peak_frequencies(self, method=1, prominence=0.1, freq_range=None):
        """
        Znajduje częstotliwości pików w spektrum
        
        Parameters:
        -----------
        method : int
            Która metoda (1 lub 2)
        prominence : float
            Minimalna prominencja piku
        freq_range : tuple, optional
            Zakres częstotliwości do analizy
            
        Returns:
        --------
        peaks_freq : array
            Częstotliwości pików w GHz
        peaks_amp : array
            Amplitudy pików
        """
        self._check_calculated()
        from scipy.signal import find_peaks
        
        fmr_data = self.fmr_method1 if method == 1 else self.fmr_method2
        
        if freq_range:
            mask = (self.freq_ghz >= freq_range[0]) & (self.freq_ghz <= freq_range[1])
            freq_search = self.freq_ghz[mask]
            fmr_search = fmr_data[mask]
        else:
            freq_search = self.freq_ghz[1:]  # Pomijamy DC
            fmr_search = fmr_data[1:]
        
        # Znajdź piki
        peaks, properties = find_peaks(fmr_search, prominence=prominence*np.max(fmr_search))
        
        peaks_freq = freq_search[peaks]
        peaks_amp = fmr_search[peaks]
        
        print(f"Znalezione piki (Metoda {method}):")
        for i, (freq, amp) in enumerate(zip(peaks_freq, peaks_amp)):
            print(f"  Pik {i+1}: {freq:.3f} GHz, amplituda: {amp:.2e}")
        
        return peaks_freq, peaks_amp
    
    def export_data(self, filename):
        """
        Eksportuje dane spektrum do pliku CSV
        """
        self._check_calculated()
        
        data_export = np.column_stack([
            self.freq_ghz,
            self.fmr_method1,
            self.fmr_method2
        ])
        
        header = "Frequency_GHz,FFT_then_Average,Average_then_FFT"
        np.savetxt(filename, data_export, delimiter=',', header=header, comments='')
        print(f"Dane wyeksportowane do: {filename}")

# Przykład użycia:
"""
# Inicjalizacja analizatora
analyzer = FMRAnalyzer(m_z, job)

# Obliczenie FFT (tylko raz!)
analyzer.calculate_fft_data()

# Różne wykresy bez ponownego obliczania FFT
analyzer.plot_spectrum(save_path='fmr_spectrum.png')
analyzer.plot_comparison(save_path='fmr_comparison.png')
analyzer.plot_comparison(freq_range=(0, 50), log_scale=True, normalize=True)
analyzer.plot_comparison(show_difference=True)

# Analiza pików
peaks_freq, peaks_amp = analyzer.get_peak_frequencies(method=1, prominence=0.1)

# Eksport danych
analyzer.export_data('fmr_data.csv')
""", '$M_y

    def plot_comparison(self, save_path=None, dpi=300, freq_range=None, 
                       log_scale=False, normalize=False, show_difference=False):
        """
        Tworzy wykres porównawczy obu metod na jednym panelu
        
        Parameters:
        -----------
        save_path : str, optional
            Ścieżka do zapisania wykresu
        dpi : int
            Rozdzielczość wykresu
        freq_range : tuple, optional
            Zakres częstotliwości (min_freq, max_freq) w GHz
        log_scale : bool
            Czy użyć skali logarytmicznej dla osi Y
        normalize : bool
            Czy znormalizować spektra do maksimum
        show_difference : bool
            Czy pokazać różnicę między metodami
        """
        self._check_calculated()
        
        # Przygotowanie danych do wykresu
        fmr1 = self.fmr_method1.copy()
        fmr2 = self.fmr_method2.copy()
        
        if normalize:
            fmr1 = fmr1 / np.max(fmr1)
            fmr2 = fmr2 / np.max(fmr2)
        
        # Określenie zakresu częstotliwości
        if freq_range:
            mask = (self.freq_ghz >= freq_range[0]) & (self.freq_ghz <= freq_range[1])
            freq_plot = self.freq_ghz[mask]
            fmr1_plot = fmr1[mask]
            fmr2_plot = fmr2[mask]
        else:
            freq_plot = self.freq_ghz[1:]  # Pomijamy DC
            fmr1_plot = fmr1[1:]
            fmr2_plot = fmr2[1:]
        
        # Tworzenie wykresu
        if show_difference:
            fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 10))
        else:
            fig, ax1 = plt.subplots(figsize=(12, 8))
        
        # Wykresy obu metod
        ax1.plot(freq_plot, fmr1_plot, 'b-', linewidth=2.5, alpha=0.8,
                label='Metoda 1: FFT → Uśrednianie')
        ax1.plot(freq_plot, fmr2_plot, 'r--', linewidth=2.5, alpha=0.8,
                label='Metoda 2: Uśrednianie → FFT')
        
        ax1.set_xlabel('Częstotliwość [GHz]', fontweight='bold')
        ylabel = 'Amplituda FFT [znorm.]' if normalize else 'Amplituda FFT [a.u.]'
        ax1.set_ylabel(ylabel, fontweight='bold')
        ax1.set_title('Porównanie spektrów FMR - Dwie metody obliczania FFT', 
                     fontweight='bold', fontsize=16, pad=20)
        
        ax1.grid(True, alpha=0.3)
        ax1.legend(frameon=True, fancybox=True, shadow=True, loc='upper right')
        
        if log_scale:
            ax1.set_yscale('log')
        else:
            ax1.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))
        
        # Wykres różnicy (jeśli wymagany)
        if show_difference:
            difference = fmr1_plot - fmr2_plot
            ax2.plot(freq_plot, difference, 'g-', linewidth=2, alpha=0.8)
            ax2.set_xlabel('Częstotliwość [GHz]', fontweight='bold')
            ax2.set_ylabel('Różnica [Metoda 1 - Metoda 2]', fontweight='bold')
            ax2.set_title('Różnica między metodami', fontweight='bold', pad=15)
            ax2.grid(True, alpha=0.3)
            ax2.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))
        
        # Dodanie informacji
        info_text = f'Δt = {self.job.t_sampl:.2e} s | Δf = {self.freq_ghz[1]:.3f} GHz | N = {self.m_z.shape[0]} pts'
        if freq_range:
            info_text += f' | Zakres: {freq_range[0]:.1f}-{freq_range[1]:.1f} GHz'
        
        ax1.text(0.02, 0.98, info_text, transform=ax1.transAxes, fontsize=11,
                verticalalignment='top', 
                bbox=dict(boxstyle="round,pad=0.3", facecolor="white", alpha=0.8))
        
        plt.tight_layout()
        
        if save_path:
            plt.savefig(save_path, dpi=dpi, bbox_inches='tight')
            print(f"Wykres porównawczy zapisany jako: {save_path}")
        
        plt.show()
        
        return fig, ax1 if not show_difference else (fig, ax1, ax2)
    
    def get_peak_frequencies(self, method=1, prominence=0.1, freq_range=None):
        """
        Znajduje częstotliwości pików w spektrum
        
        Parameters:
        -----------
        method : int
            Która metoda (1 lub 2)
        prominence : float
            Minimalna prominencja piku
        freq_range : tuple, optional
            Zakres częstotliwości do analizy
            
        Returns:
        --------
        peaks_freq : array
            Częstotliwości pików w GHz
        peaks_amp : array
            Amplitudy pików
        """
        self._check_calculated()
        from scipy.signal import find_peaks
        
        fmr_data = self.fmr_method1 if method == 1 else self.fmr_method2
        
        if freq_range:
            mask = (self.freq_ghz >= freq_range[0]) & (self.freq_ghz <= freq_range[1])
            freq_search = self.freq_ghz[mask]
            fmr_search = fmr_data[mask]
        else:
            freq_search = self.freq_ghz[1:]  # Pomijamy DC
            fmr_search = fmr_data[1:]
        
        # Znajdź piki
        peaks, properties = find_peaks(fmr_search, prominence=prominence*np.max(fmr_search))
        
        peaks_freq = freq_search[peaks]
        peaks_amp = fmr_search[peaks]
        
        print(f"Znalezione piki (Metoda {method}):")
        for i, (freq, amp) in enumerate(zip(peaks_freq, peaks_amp)):
            print(f"  Pik {i+1}: {freq:.3f} GHz, amplituda: {amp:.2e}")
        
        return peaks_freq, peaks_amp
    
    def export_data(self, filename):
        """
        Eksportuje dane spektrum do pliku CSV
        """
        self._check_calculated()
        
        data_export = np.column_stack([
            self.freq_ghz,
            self.fmr_method1,
            self.fmr_method2
        ])
        
        header = "Frequency_GHz,FFT_then_Average,Average_then_FFT"
        np.savetxt(filename, data_export, delimiter=',', header=header, comments='')
        print(f"Dane wyeksportowane do: {filename}")

# Przykład użycia:
"""
# Inicjalizacja analizatora
analyzer = FMRAnalyzer(m_z, job)

# Obliczenie FFT (tylko raz!)
analyzer.calculate_fft_data()

# Różne wykresy bez ponownego obliczania FFT
analyzer.plot_spectrum(save_path='fmr_spectrum.png')
analyzer.plot_comparison(save_path='fmr_comparison.png')
analyzer.plot_comparison(freq_range=(0, 50), log_scale=True, normalize=True)
analyzer.plot_comparison(show_difference=True)

# Analiza pików
peaks_freq, peaks_amp = analyzer.get_peak_frequencies(method=1, prominence=0.1)

# Eksport danych
analyzer.export_data('fmr_data.csv')
""", '$M_z

    def plot_comparison(self, save_path=None, dpi=300, freq_range=None, 
                       log_scale=False, normalize=False, show_difference=False):
        """
        Tworzy wykres porównawczy obu metod na jednym panelu
        
        Parameters:
        -----------
        save_path : str, optional
            Ścieżka do zapisania wykresu
        dpi : int
            Rozdzielczość wykresu
        freq_range : tuple, optional
            Zakres częstotliwości (min_freq, max_freq) w GHz
        log_scale : bool
            Czy użyć skali logarytmicznej dla osi Y
        normalize : bool
            Czy znormalizować spektra do maksimum
        show_difference : bool
            Czy pokazać różnicę między metodami
        """
        self._check_calculated()
        
        # Przygotowanie danych do wykresu
        fmr1 = self.fmr_method1.copy()
        fmr2 = self.fmr_method2.copy()
        
        if normalize:
            fmr1 = fmr1 / np.max(fmr1)
            fmr2 = fmr2 / np.max(fmr2)
        
        # Określenie zakresu częstotliwości
        if freq_range:
            mask = (self.freq_ghz >= freq_range[0]) & (self.freq_ghz <= freq_range[1])
            freq_plot = self.freq_ghz[mask]
            fmr1_plot = fmr1[mask]
            fmr2_plot = fmr2[mask]
        else:
            freq_plot = self.freq_ghz[1:]  # Pomijamy DC
            fmr1_plot = fmr1[1:]
            fmr2_plot = fmr2[1:]
        
        # Tworzenie wykresu
        if show_difference:
            fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 10))
        else:
            fig, ax1 = plt.subplots(figsize=(12, 8))
        
        # Wykresy obu metod
        ax1.plot(freq_plot, fmr1_plot, 'b-', linewidth=2.5, alpha=0.8,
                label='Metoda 1: FFT → Uśrednianie')
        ax1.plot(freq_plot, fmr2_plot, 'r--', linewidth=2.5, alpha=0.8,
                label='Metoda 2: Uśrednianie → FFT')
        
        ax1.set_xlabel('Częstotliwość [GHz]', fontweight='bold')
        ylabel = 'Amplituda FFT [znorm.]' if normalize else 'Amplituda FFT [a.u.]'
        ax1.set_ylabel(ylabel, fontweight='bold')
        ax1.set_title('Porównanie spektrów FMR - Dwie metody obliczania FFT', 
                     fontweight='bold', fontsize=16, pad=20)
        
        ax1.grid(True, alpha=0.3)
        ax1.legend(frameon=True, fancybox=True, shadow=True, loc='upper right')
        
        if log_scale:
            ax1.set_yscale('log')
        else:
            ax1.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))
        
        # Wykres różnicy (jeśli wymagany)
        if show_difference:
            difference = fmr1_plot - fmr2_plot
            ax2.plot(freq_plot, difference, 'g-', linewidth=2, alpha=0.8)
            ax2.set_xlabel('Częstotliwość [GHz]', fontweight='bold')
            ax2.set_ylabel('Różnica [Metoda 1 - Metoda 2]', fontweight='bold')
            ax2.set_title('Różnica między metodami', fontweight='bold', pad=15)
            ax2.grid(True, alpha=0.3)
            ax2.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))
        
        # Dodanie informacji
        info_text = f'Δt = {self.job.t_sampl:.2e} s | Δf = {self.freq_ghz[1]:.3f} GHz | N = {self.m_z.shape[0]} pts'
        if freq_range:
            info_text += f' | Zakres: {freq_range[0]:.1f}-{freq_range[1]:.1f} GHz'
        
        ax1.text(0.02, 0.98, info_text, transform=ax1.transAxes, fontsize=11,
                verticalalignment='top', 
                bbox=dict(boxstyle="round,pad=0.3", facecolor="white", alpha=0.8))
        
        plt.tight_layout()
        
        if save_path:
            plt.savefig(save_path, dpi=dpi, bbox_inches='tight')
            print(f"Wykres porównawczy zapisany jako: {save_path}")
        
        plt.show()
        
        return fig, ax1 if not show_difference else (fig, ax1, ax2)
    
    def get_peak_frequencies(self, method=1, prominence=0.1, freq_range=None):
        """
        Znajduje częstotliwości pików w spektrum
        
        Parameters:
        -----------
        method : int
            Która metoda (1 lub 2)
        prominence : float
            Minimalna prominencja piku
        freq_range : tuple, optional
            Zakres częstotliwości do analizy
            
        Returns:
        --------
        peaks_freq : array
            Częstotliwości pików w GHz
        peaks_amp : array
            Amplitudy pików
        """
        self._check_calculated()
        from scipy.signal import find_peaks
        
        fmr_data = self.fmr_method1 if method == 1 else self.fmr_method2
        
        if freq_range:
            mask = (self.freq_ghz >= freq_range[0]) & (self.freq_ghz <= freq_range[1])
            freq_search = self.freq_ghz[mask]
            fmr_search = fmr_data[mask]
        else:
            freq_search = self.freq_ghz[1:]  # Pomijamy DC
            fmr_search = fmr_data[1:]
        
        # Znajdź piki
        peaks, properties = find_peaks(fmr_search, prominence=prominence*np.max(fmr_search))
        
        peaks_freq = freq_search[peaks]
        peaks_amp = fmr_search[peaks]
        
        print(f"Znalezione piki (Metoda {method}):")
        for i, (freq, amp) in enumerate(zip(peaks_freq, peaks_amp)):
            print(f"  Pik {i+1}: {freq:.3f} GHz, amplituda: {amp:.2e}")
        
        return peaks_freq, peaks_amp
    
    def export_data(self, filename):
        """
        Eksportuje dane spektrum do pliku CSV
        """
        self._check_calculated()
        
        data_export = np.column_stack([
            self.freq_ghz,
            self.fmr_method1,
            self.fmr_method2
        ])
        
        header = "Frequency_GHz,FFT_then_Average,Average_then_FFT"
        np.savetxt(filename, data_export, delimiter=',', header=header, comments='')
        print(f"Dane wyeksportowane do: {filename}")

# Przykład użycia:
"""
# Inicjalizacja analizatora
analyzer = FMRAnalyzer(m_z, job)

# Obliczenie FFT (tylko raz!)
analyzer.calculate_fft_data()

# Różne wykresy bez ponownego obliczania FFT
analyzer.plot_spectrum(save_path='fmr_spectrum.png')
analyzer.plot_comparison(save_path='fmr_comparison.png')
analyzer.plot_comparison(freq_range=(0, 50), log_scale=True, normalize=True)
analyzer.plot_comparison(show_difference=True)

# Analiza pików
peaks_freq, peaks_amp = analyzer.get_peak_frequencies(method=1, prominence=0.1)

# Eksport danych
analyzer.export_data('fmr_data.csv')
"""]
            
            # Wykres 1: Metoda 1
            for i in range(3):
                data_plot = fmr1_plot[:, i] if has_components else fmr1_plot
                ax1.plot(freq_plot, data_plot, color=colors_comp[i], 
                        linewidth=2, alpha=0.8, label=labels[i])
                
            # Wykres 2: Metoda 2  
            for i in range(3):
                data_plot = fmr2_plot[:, i] if has_components else fmr2_plot
                ax2.plot(freq_plot, data_plot, color=colors_comp[i], 
                        linewidth=2, alpha=0.8, label=labels[i])
        else:
            # Pojedyncze krzywe
            ax1.plot(freq_plot, fmr1_plot, color=generate_pastel_colors(1)[0], 
                    linewidth=2, alpha=0.8, label='FFT → Uśrednianie')
            ax2.plot(freq_plot, fmr2_plot, color=generate_pastel_colors(1)[0], 
                    linewidth=2, alpha=0.8, label='Uśrednianie → FFT')
        
        # Formatowanie osi i etykiet
        for ax, title in zip([ax1, ax2], 
                           ['Metoda 1: FFT dla każdego punktu, następnie uśrednianie',
                            'Metoda 2: Uśrednianie przestrzenne, następnie FFT']):
            ax.set_xlabel('Częstotliwość [GHz]')
            ylabel = 'Amplituda FFT [znorm.]' if normalize else 'Amplituda FFT [a.u.]'
            ax.set_ylabel(ylabel)
            ax.set_title(title, fontweight='bold', pad=15)
            ax.grid(True, alpha=0.3)
            ax.legend(frameon=True, fancybox=True, shadow=True)
            
            if log_scale:
                ax.set_yscale('log')
            else:
                ax.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))
        
        # Dodanie informacji o parametrach
        info_text = f'Krok czasowy: {self.job.t_sampl:.2e} s\n'
        info_text += f'Rozdzielczość częstotliwościowa: {self.freq_ghz[1]:.3f} GHz\n'
        info_text += f'Liczba punktów czasowych: {self.m_z.shape[0]}\n'
        if freq_range:
            info_text += f'Zakres częstotliwości: {freq_range[0]:.1f} - {freq_range[1]:.1f} GHz'
        
        fig.text(0.02, 0.02, info_text, fontsize=8, 
                 bbox=dict(boxstyle="round,pad=0.3", facecolor="lightgray", alpha=0.7))
        
        plt.tight_layout()
        plt.subplots_adjust(top=0.92, bottom=0.12)
        
        if save_path:
            plt.savefig(save_path, dpi=dpi, bbox_inches='tight', 
                       facecolor='white', edgecolor='none')
            print(f"Wykres zapisany jako: {save_path}")
        
        plt.show()
        
        return fig, (ax1, ax2)

    def plot_comparison(self, save_path=None, dpi=300, freq_range=None, 
                       log_scale=False, normalize=False, show_difference=False):
        """
        Tworzy wykres porównawczy obu metod na jednym panelu
        
        Parameters:
        -----------
        save_path : str, optional
            Ścieżka do zapisania wykresu
        dpi : int
            Rozdzielczość wykresu
        freq_range : tuple, optional
            Zakres częstotliwości (min_freq, max_freq) w GHz
        log_scale : bool
            Czy użyć skali logarytmicznej dla osi Y
        normalize : bool
            Czy znormalizować spektra do maksimum
        show_difference : bool
            Czy pokazać różnicę między metodami
        """
        self._check_calculated()
        
        # Przygotowanie danych do wykresu
        fmr1 = self.fmr_method1.copy()
        fmr2 = self.fmr_method2.copy()
        
        if normalize:
            fmr1 = fmr1 / np.max(fmr1)
            fmr2 = fmr2 / np.max(fmr2)
        
        # Określenie zakresu częstotliwości
        if freq_range:
            mask = (self.freq_ghz >= freq_range[0]) & (self.freq_ghz <= freq_range[1])
            freq_plot = self.freq_ghz[mask]
            fmr1_plot = fmr1[mask]
            fmr2_plot = fmr2[mask]
        else:
            freq_plot = self.freq_ghz[1:]  # Pomijamy DC
            fmr1_plot = fmr1[1:]
            fmr2_plot = fmr2[1:]
        
        # Tworzenie wykresu
        if show_difference:
            fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 10))
        else:
            fig, ax1 = plt.subplots(figsize=(12, 8))
        
        # Wykresy obu metod
        ax1.plot(freq_plot, fmr1_plot, 'b-', linewidth=2.5, alpha=0.8,
                label='Metoda 1: FFT → Uśrednianie')
        ax1.plot(freq_plot, fmr2_plot, 'r--', linewidth=2.5, alpha=0.8,
                label='Metoda 2: Uśrednianie → FFT')
        
        ax1.set_xlabel('Częstotliwość [GHz]', fontweight='bold')
        ylabel = 'Amplituda FFT [znorm.]' if normalize else 'Amplituda FFT [a.u.]'
        ax1.set_ylabel(ylabel, fontweight='bold')
        ax1.set_title('Porównanie spektrów FMR - Dwie metody obliczania FFT', 
                     fontweight='bold', fontsize=16, pad=20)
        
        ax1.grid(True, alpha=0.3)
        ax1.legend(frameon=True, fancybox=True, shadow=True, loc='upper right')
        
        if log_scale:
            ax1.set_yscale('log')
        else:
            ax1.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))
        
        # Wykres różnicy (jeśli wymagany)
        if show_difference:
            difference = fmr1_plot - fmr2_plot
            ax2.plot(freq_plot, difference, 'g-', linewidth=2, alpha=0.8)
            ax2.set_xlabel('Częstotliwość [GHz]', fontweight='bold')
            ax2.set_ylabel('Różnica [Metoda 1 - Metoda 2]', fontweight='bold')
            ax2.set_title('Różnica między metodami', fontweight='bold', pad=15)
            ax2.grid(True, alpha=0.3)
            ax2.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))
        
        # Dodanie informacji
        info_text = f'Δt = {self.job.t_sampl:.2e} s | Δf = {self.freq_ghz[1]:.3f} GHz | N = {self.m_z.shape[0]} pts'
        if freq_range:
            info_text += f' | Zakres: {freq_range[0]:.1f}-{freq_range[1]:.1f} GHz'
        
        ax1.text(0.02, 0.98, info_text, transform=ax1.transAxes, fontsize=11,
                verticalalignment='top', 
                bbox=dict(boxstyle="round,pad=0.3", facecolor="white", alpha=0.8))
        
        plt.tight_layout()
        
        if save_path:
            plt.savefig(save_path, dpi=dpi, bbox_inches='tight')
            print(f"Wykres porównawczy zapisany jako: {save_path}")
        
        plt.show()
        
        return fig, ax1 if not show_difference else (fig, ax1, ax2)
    
    def get_peak_frequencies(self, method=1, prominence=0.1, freq_range=None):
        """
        Znajduje częstotliwości pików w spektrum
        
        Parameters:
        -----------
        method : int
            Która metoda (1 lub 2)
        prominence : float
            Minimalna prominencja piku
        freq_range : tuple, optional
            Zakres częstotliwości do analizy
            
        Returns:
        --------
        peaks_freq : array
            Częstotliwości pików w GHz
        peaks_amp : array
            Amplitudy pików
        """
        self._check_calculated()
        from scipy.signal import find_peaks
        
        fmr_data = self.fmr_method1 if method == 1 else self.fmr_method2
        
        if freq_range:
            mask = (self.freq_ghz >= freq_range[0]) & (self.freq_ghz <= freq_range[1])
            freq_search = self.freq_ghz[mask]
            fmr_search = fmr_data[mask]
        else:
            freq_search = self.freq_ghz[1:]  # Pomijamy DC
            fmr_search = fmr_data[1:]
        
        # Znajdź piki
        peaks, properties = find_peaks(fmr_search, prominence=prominence*np.max(fmr_search))
        
        peaks_freq = freq_search[peaks]
        peaks_amp = fmr_search[peaks]
        
        print(f"Znalezione piki (Metoda {method}):")
        for i, (freq, amp) in enumerate(zip(peaks_freq, peaks_amp)):
            print(f"  Pik {i+1}: {freq:.3f} GHz, amplituda: {amp:.2e}")
        
        return peaks_freq, peaks_amp
    
    def export_data(self, filename):
        """
        Eksportuje dane spektrum do pliku CSV
        """
        self._check_calculated()
        
        data_export = np.column_stack([
            self.freq_ghz,
            self.fmr_method1,
            self.fmr_method2
        ])
        
        header = "Frequency_GHz,FFT_then_Average,Average_then_FFT"
        np.savetxt(filename, data_export, delimiter=',', header=header, comments='')
        print(f"Dane wyeksportowane do: {filename}")

# Przykład użycia:
"""
# Inicjalizacja analizatora
analyzer = FMRAnalyzer(m_z, job)

# Obliczenie FFT (tylko raz!)
analyzer.calculate_fft_data()

# Różne wykresy bez ponownego obliczania FFT
analyzer.plot_spectrum(save_path='fmr_spectrum.png')
analyzer.plot_comparison(save_path='fmr_comparison.png')
analyzer.plot_comparison(freq_range=(0, 50), log_scale=True, normalize=True)
analyzer.plot_comparison(show_difference=True)

# Analiza pików
peaks_freq, peaks_amp = analyzer.get_peak_frequencies(method=1, prominence=0.1)

# Eksport danych
analyzer.export_data('fmr_data.csv')
"""]
            n_curves = 6 if not show_difference else 3  # 3 komponenty x 2 metody
            
            # Wykresy obu metod dla każdej komponenty
            for i in range(3):
                # Metoda 1
                data1 = fmr1_plot[:, i] if has_components else fmr1_plot
                ax1.plot(freq_plot, data1, color=colors_comp[i], 
                        linewidth=2.5, alpha=0.8, linestyle='-',
                        label=f'{labels[i]} (FFT→Uśr.)')
                
                # Metoda 2
                data2 = fmr2_plot[:, i] if has_components else fmr2_plot
                ax1.plot(freq_plot, data2, color=colors_comp[i], 
                        linewidth=2.5, alpha=0.6, linestyle='--',
                        label=f'{labels[i]} (Uśr.→FFT)')
        else:
            # Pojedyncze krzywe
            colors_methods = generate_pastel_colors(2)
            ax1.plot(freq_plot, fmr1_plot, color=colors_methods[0], 
                    linewidth=2.5, alpha=0.8, linestyle='-',
                    label='Metoda 1: FFT → Uśrednianie')
            ax1.plot(freq_plot, fmr2_plot, color=colors_methods[1], 
                    linewidth=2.5, alpha=0.8, linestyle='--',
                    label='Metoda 2: Uśrednianie → FFT')
        
        ax1.set_xlabel('Częstotliwość [GHz]', fontweight='bold')
        ylabel = 'Amplituda FFT [znorm.]' if normalize else 'Amplituda FFT [a.u.]'
        ax1.set_ylabel(ylabel, fontweight='bold')
        ax1.set_title('Porównanie spektrów FMR - Dwie metody obliczania FFT', 
                     fontweight='bold', pad=20)
        
        ax1.grid(True, alpha=0.3)
        ax1.legend(frameon=True, fancybox=True, shadow=True, loc='best')
        
        if log_scale:
            ax1.set_yscale('log')
        else:
            ax1.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))
        
        # Wykres różnicy (jeśli wymagany)
        if show_difference:
            if has_components:
                colors_comp = generate_pastel_colors(3)
                labels = ['$M_x
    
    def get_peak_frequencies(self, method=1, prominence=0.1, freq_range=None):
        """
        Znajduje częstotliwości pików w spektrum
        
        Parameters:
        -----------
        method : int
            Która metoda (1 lub 2)
        prominence : float
            Minimalna prominencja piku
        freq_range : tuple, optional
            Zakres częstotliwości do analizy
            
        Returns:
        --------
        peaks_freq : array
            Częstotliwości pików w GHz
        peaks_amp : array
            Amplitudy pików
        """
        self._check_calculated()
        from scipy.signal import find_peaks
        
        fmr_data = self.fmr_method1 if method == 1 else self.fmr_method2
        
        if freq_range:
            mask = (self.freq_ghz >= freq_range[0]) & (self.freq_ghz <= freq_range[1])
            freq_search = self.freq_ghz[mask]
            fmr_search = fmr_data[mask]
        else:
            freq_search = self.freq_ghz[1:]  # Pomijamy DC
            fmr_search = fmr_data[1:]
        
        # Znajdź piki
        peaks, properties = find_peaks(fmr_search, prominence=prominence*np.max(fmr_search))
        
        peaks_freq = freq_search[peaks]
        peaks_amp = fmr_search[peaks]
        
        print(f"Znalezione piki (Metoda {method}):")
        for i, (freq, amp) in enumerate(zip(peaks_freq, peaks_amp)):
            print(f"  Pik {i+1}: {freq:.3f} GHz, amplituda: {amp:.2e}")
        
        return peaks_freq, peaks_amp
    
    def export_data(self, filename):
        """
        Eksportuje dane spektrum do pliku CSV
        """
        self._check_calculated()
        
        data_export = np.column_stack([
            self.freq_ghz,
            self.fmr_method1,
            self.fmr_method2
        ])
        
        header = "Frequency_GHz,FFT_then_Average,Average_then_FFT"
        np.savetxt(filename, data_export, delimiter=',', header=header, comments='')
        print(f"Dane wyeksportowane do: {filename}")

# Przykład użycia:
"""
# Inicjalizacja analizatora
analyzer = FMRAnalyzer(m_z, job)

# Obliczenie FFT (tylko raz!)
analyzer.calculate_fft_data()

# Różne wykresy bez ponownego obliczania FFT
analyzer.plot_spectrum(save_path='fmr_spectrum.png')
analyzer.plot_comparison(save_path='fmr_comparison.png')
analyzer.plot_comparison(freq_range=(0, 50), log_scale=True, normalize=True)
analyzer.plot_comparison(show_difference=True)

# Analiza pików
peaks_freq, peaks_amp = analyzer.get_peak_frequencies(method=1, prominence=0.1)

# Eksport danych
analyzer.export_data('fmr_data.csv')
""", '$M_y

    def plot_comparison(self, save_path=None, dpi=300, freq_range=None, 
                       log_scale=False, normalize=False, show_difference=False):
        """
        Tworzy wykres porównawczy obu metod na jednym panelu
        
        Parameters:
        -----------
        save_path : str, optional
            Ścieżka do zapisania wykresu
        dpi : int
            Rozdzielczość wykresu
        freq_range : tuple, optional
            Zakres częstotliwości (min_freq, max_freq) w GHz
        log_scale : bool
            Czy użyć skali logarytmicznej dla osi Y
        normalize : bool
            Czy znormalizować spektra do maksimum
        show_difference : bool
            Czy pokazać różnicę między metodami
        """
        self._check_calculated()
        
        # Przygotowanie danych do wykresu
        fmr1 = self.fmr_method1.copy()
        fmr2 = self.fmr_method2.copy()
        
        if normalize:
            fmr1 = fmr1 / np.max(fmr1)
            fmr2 = fmr2 / np.max(fmr2)
        
        # Określenie zakresu częstotliwości
        if freq_range:
            mask = (self.freq_ghz >= freq_range[0]) & (self.freq_ghz <= freq_range[1])
            freq_plot = self.freq_ghz[mask]
            fmr1_plot = fmr1[mask]
            fmr2_plot = fmr2[mask]
        else:
            freq_plot = self.freq_ghz[1:]  # Pomijamy DC
            fmr1_plot = fmr1[1:]
            fmr2_plot = fmr2[1:]
        
        # Tworzenie wykresu
        if show_difference:
            fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 10))
        else:
            fig, ax1 = plt.subplots(figsize=(12, 8))
        
        # Wykresy obu metod
        ax1.plot(freq_plot, fmr1_plot, 'b-', linewidth=2.5, alpha=0.8,
                label='Metoda 1: FFT → Uśrednianie')
        ax1.plot(freq_plot, fmr2_plot, 'r--', linewidth=2.5, alpha=0.8,
                label='Metoda 2: Uśrednianie → FFT')
        
        ax1.set_xlabel('Częstotliwość [GHz]', fontweight='bold')
        ylabel = 'Amplituda FFT [znorm.]' if normalize else 'Amplituda FFT [a.u.]'
        ax1.set_ylabel(ylabel, fontweight='bold')
        ax1.set_title('Porównanie spektrów FMR - Dwie metody obliczania FFT', 
                     fontweight='bold', fontsize=16, pad=20)
        
        ax1.grid(True, alpha=0.3)
        ax1.legend(frameon=True, fancybox=True, shadow=True, loc='upper right')
        
        if log_scale:
            ax1.set_yscale('log')
        else:
            ax1.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))
        
        # Wykres różnicy (jeśli wymagany)
        if show_difference:
            difference = fmr1_plot - fmr2_plot
            ax2.plot(freq_plot, difference, 'g-', linewidth=2, alpha=0.8)
            ax2.set_xlabel('Częstotliwość [GHz]', fontweight='bold')
            ax2.set_ylabel('Różnica [Metoda 1 - Metoda 2]', fontweight='bold')
            ax2.set_title('Różnica między metodami', fontweight='bold', pad=15)
            ax2.grid(True, alpha=0.3)
            ax2.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))
        
        # Dodanie informacji
        info_text = f'Δt = {self.job.t_sampl:.2e} s | Δf = {self.freq_ghz[1]:.3f} GHz | N = {self.m_z.shape[0]} pts'
        if freq_range:
            info_text += f' | Zakres: {freq_range[0]:.1f}-{freq_range[1]:.1f} GHz'
        
        ax1.text(0.02, 0.98, info_text, transform=ax1.transAxes, fontsize=11,
                verticalalignment='top', 
                bbox=dict(boxstyle="round,pad=0.3", facecolor="white", alpha=0.8))
        
        plt.tight_layout()
        
        if save_path:
            plt.savefig(save_path, dpi=dpi, bbox_inches='tight')
            print(f"Wykres porównawczy zapisany jako: {save_path}")
        
        plt.show()
        
        return fig, ax1 if not show_difference else (fig, ax1, ax2)
    
    def get_peak_frequencies(self, method=1, prominence=0.1, freq_range=None):
        """
        Znajduje częstotliwości pików w spektrum
        
        Parameters:
        -----------
        method : int
            Która metoda (1 lub 2)
        prominence : float
            Minimalna prominencja piku
        freq_range : tuple, optional
            Zakres częstotliwości do analizy
            
        Returns:
        --------
        peaks_freq : array
            Częstotliwości pików w GHz
        peaks_amp : array
            Amplitudy pików
        """
        self._check_calculated()
        from scipy.signal import find_peaks
        
        fmr_data = self.fmr_method1 if method == 1 else self.fmr_method2
        
        if freq_range:
            mask = (self.freq_ghz >= freq_range[0]) & (self.freq_ghz <= freq_range[1])
            freq_search = self.freq_ghz[mask]
            fmr_search = fmr_data[mask]
        else:
            freq_search = self.freq_ghz[1:]  # Pomijamy DC
            fmr_search = fmr_data[1:]
        
        # Znajdź piki
        peaks, properties = find_peaks(fmr_search, prominence=prominence*np.max(fmr_search))
        
        peaks_freq = freq_search[peaks]
        peaks_amp = fmr_search[peaks]
        
        print(f"Znalezione piki (Metoda {method}):")
        for i, (freq, amp) in enumerate(zip(peaks_freq, peaks_amp)):
            print(f"  Pik {i+1}: {freq:.3f} GHz, amplituda: {amp:.2e}")
        
        return peaks_freq, peaks_amp
    
    def export_data(self, filename):
        """
        Eksportuje dane spektrum do pliku CSV
        """
        self._check_calculated()
        
        data_export = np.column_stack([
            self.freq_ghz,
            self.fmr_method1,
            self.fmr_method2
        ])
        
        header = "Frequency_GHz,FFT_then_Average,Average_then_FFT"
        np.savetxt(filename, data_export, delimiter=',', header=header, comments='')
        print(f"Dane wyeksportowane do: {filename}")

# Przykład użycia:
"""
# Inicjalizacja analizatora
analyzer = FMRAnalyzer(m_z, job)

# Obliczenie FFT (tylko raz!)
analyzer.calculate_fft_data()

# Różne wykresy bez ponownego obliczania FFT
analyzer.plot_spectrum(save_path='fmr_spectrum.png')
analyzer.plot_comparison(save_path='fmr_comparison.png')
analyzer.plot_comparison(freq_range=(0, 50), log_scale=True, normalize=True)
analyzer.plot_comparison(show_difference=True)

# Analiza pików
peaks_freq, peaks_amp = analyzer.get_peak_frequencies(method=1, prominence=0.1)

# Eksport danych
analyzer.export_data('fmr_data.csv')
""", '$M_z

    def plot_comparison(self, save_path=None, dpi=300, freq_range=None, 
                       log_scale=False, normalize=False, show_difference=False):
        """
        Tworzy wykres porównawczy obu metod na jednym panelu
        
        Parameters:
        -----------
        save_path : str, optional
            Ścieżka do zapisania wykresu
        dpi : int
            Rozdzielczość wykresu
        freq_range : tuple, optional
            Zakres częstotliwości (min_freq, max_freq) w GHz
        log_scale : bool
            Czy użyć skali logarytmicznej dla osi Y
        normalize : bool
            Czy znormalizować spektra do maksimum
        show_difference : bool
            Czy pokazać różnicę między metodami
        """
        self._check_calculated()
        
        # Przygotowanie danych do wykresu
        fmr1 = self.fmr_method1.copy()
        fmr2 = self.fmr_method2.copy()
        
        if normalize:
            fmr1 = fmr1 / np.max(fmr1)
            fmr2 = fmr2 / np.max(fmr2)
        
        # Określenie zakresu częstotliwości
        if freq_range:
            mask = (self.freq_ghz >= freq_range[0]) & (self.freq_ghz <= freq_range[1])
            freq_plot = self.freq_ghz[mask]
            fmr1_plot = fmr1[mask]
            fmr2_plot = fmr2[mask]
        else:
            freq_plot = self.freq_ghz[1:]  # Pomijamy DC
            fmr1_plot = fmr1[1:]
            fmr2_plot = fmr2[1:]
        
        # Tworzenie wykresu
        if show_difference:
            fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 10))
        else:
            fig, ax1 = plt.subplots(figsize=(12, 8))
        
        # Wykresy obu metod
        ax1.plot(freq_plot, fmr1_plot, 'b-', linewidth=2.5, alpha=0.8,
                label='Metoda 1: FFT → Uśrednianie')
        ax1.plot(freq_plot, fmr2_plot, 'r--', linewidth=2.5, alpha=0.8,
                label='Metoda 2: Uśrednianie → FFT')
        
        ax1.set_xlabel('Częstotliwość [GHz]', fontweight='bold')
        ylabel = 'Amplituda FFT [znorm.]' if normalize else 'Amplituda FFT [a.u.]'
        ax1.set_ylabel(ylabel, fontweight='bold')
        ax1.set_title('Porównanie spektrów FMR - Dwie metody obliczania FFT', 
                     fontweight='bold', fontsize=16, pad=20)
        
        ax1.grid(True, alpha=0.3)
        ax1.legend(frameon=True, fancybox=True, shadow=True, loc='upper right')
        
        if log_scale:
            ax1.set_yscale('log')
        else:
            ax1.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))
        
        # Wykres różnicy (jeśli wymagany)
        if show_difference:
            difference = fmr1_plot - fmr2_plot
            ax2.plot(freq_plot, difference, 'g-', linewidth=2, alpha=0.8)
            ax2.set_xlabel('Częstotliwość [GHz]', fontweight='bold')
            ax2.set_ylabel('Różnica [Metoda 1 - Metoda 2]', fontweight='bold')
            ax2.set_title('Różnica między metodami', fontweight='bold', pad=15)
            ax2.grid(True, alpha=0.3)
            ax2.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))
        
        # Dodanie informacji
        info_text = f'Δt = {self.job.t_sampl:.2e} s | Δf = {self.freq_ghz[1]:.3f} GHz | N = {self.m_z.shape[0]} pts'
        if freq_range:
            info_text += f' | Zakres: {freq_range[0]:.1f}-{freq_range[1]:.1f} GHz'
        
        ax1.text(0.02, 0.98, info_text, transform=ax1.transAxes, fontsize=11,
                verticalalignment='top', 
                bbox=dict(boxstyle="round,pad=0.3", facecolor="white", alpha=0.8))
        
        plt.tight_layout()
        
        if save_path:
            plt.savefig(save_path, dpi=dpi, bbox_inches='tight')
            print(f"Wykres porównawczy zapisany jako: {save_path}")
        
        plt.show()
        
        return fig, ax1 if not show_difference else (fig, ax1, ax2)
    
    def get_peak_frequencies(self, method=1, prominence=0.1, freq_range=None):
        """
        Znajduje częstotliwości pików w spektrum
        
        Parameters:
        -----------
        method : int
            Która metoda (1 lub 2)
        prominence : float
            Minimalna prominencja piku
        freq_range : tuple, optional
            Zakres częstotliwości do analizy
            
        Returns:
        --------
        peaks_freq : array
            Częstotliwości pików w GHz
        peaks_amp : array
            Amplitudy pików
        """
        self._check_calculated()
        from scipy.signal import find_peaks
        
        fmr_data = self.fmr_method1 if method == 1 else self.fmr_method2
        
        if freq_range:
            mask = (self.freq_ghz >= freq_range[0]) & (self.freq_ghz <= freq_range[1])
            freq_search = self.freq_ghz[mask]
            fmr_search = fmr_data[mask]
        else:
            freq_search = self.freq_ghz[1:]  # Pomijamy DC
            fmr_search = fmr_data[1:]
        
        # Znajdź piki
        peaks, properties = find_peaks(fmr_search, prominence=prominence*np.max(fmr_search))
        
        peaks_freq = freq_search[peaks]
        peaks_amp = fmr_search[peaks]
        
        print(f"Znalezione piki (Metoda {method}):")
        for i, (freq, amp) in enumerate(zip(peaks_freq, peaks_amp)):
            print(f"  Pik {i+1}: {freq:.3f} GHz, amplituda: {amp:.2e}")
        
        return peaks_freq, peaks_amp
    
    def export_data(self, filename):
        """
        Eksportuje dane spektrum do pliku CSV
        """
        self._check_calculated()
        
        data_export = np.column_stack([
            self.freq_ghz,
            self.fmr_method1,
            self.fmr_method2
        ])
        
        header = "Frequency_GHz,FFT_then_Average,Average_then_FFT"
        np.savetxt(filename, data_export, delimiter=',', header=header, comments='')
        print(f"Dane wyeksportowane do: {filename}")

# Przykład użycia:
"""
# Inicjalizacja analizatora
analyzer = FMRAnalyzer(m_z, job)

# Obliczenie FFT (tylko raz!)
analyzer.calculate_fft_data()

# Różne wykresy bez ponownego obliczania FFT
analyzer.plot_spectrum(save_path='fmr_spectrum.png')
analyzer.plot_comparison(save_path='fmr_comparison.png')
analyzer.plot_comparison(freq_range=(0, 50), log_scale=True, normalize=True)
analyzer.plot_comparison(show_difference=True)

# Analiza pików
peaks_freq, peaks_amp = analyzer.get_peak_frequencies(method=1, prominence=0.1)

# Eksport danych
analyzer.export_data('fmr_data.csv')
"""]
            
            # Wykres 1: Metoda 1
            for i in range(3):
                data_plot = fmr1_plot[:, i] if has_components else fmr1_plot
                ax1.plot(freq_plot, data_plot, color=colors_comp[i], 
                        linewidth=2, alpha=0.8, label=labels[i])
                
            # Wykres 2: Metoda 2  
            for i in range(3):
                data_plot = fmr2_plot[:, i] if has_components else fmr2_plot
                ax2.plot(freq_plot, data_plot, color=colors_comp[i], 
                        linewidth=2, alpha=0.8, label=labels[i])
        else:
            # Pojedyncze krzywe
            ax1.plot(freq_plot, fmr1_plot, color=generate_pastel_colors(1)[0], 
                    linewidth=2, alpha=0.8, label='FFT → Uśrednianie')
            ax2.plot(freq_plot, fmr2_plot, color=generate_pastel_colors(1)[0], 
                    linewidth=2, alpha=0.8, label='Uśrednianie → FFT')
        
        # Formatowanie osi i etykiet
        for ax, title in zip([ax1, ax2], 
                           ['Metoda 1: FFT dla każdego punktu, następnie uśrednianie',
                            'Metoda 2: Uśrednianie przestrzenne, następnie FFT']):
            ax.set_xlabel('Częstotliwość [GHz]')
            ylabel = 'Amplituda FFT [znorm.]' if normalize else 'Amplituda FFT [a.u.]'
            ax.set_ylabel(ylabel)
            ax.set_title(title, fontweight='bold', pad=15)
            ax.grid(True, alpha=0.3)
            ax.legend(frameon=True, fancybox=True, shadow=True)
            
            if log_scale:
                ax.set_yscale('log')
            else:
                ax.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))
        
        # Dodanie informacji o parametrach
        info_text = f'Krok czasowy: {self.job.t_sampl:.2e} s\n'
        info_text += f'Rozdzielczość częstotliwościowa: {self.freq_ghz[1]:.3f} GHz\n'
        info_text += f'Liczba punktów czasowych: {self.m_z.shape[0]}\n'
        if freq_range:
            info_text += f'Zakres częstotliwości: {freq_range[0]:.1f} - {freq_range[1]:.1f} GHz'
        
        fig.text(0.02, 0.02, info_text, fontsize=8, 
                 bbox=dict(boxstyle="round,pad=0.3", facecolor="lightgray", alpha=0.7))
        
        plt.tight_layout()
        plt.subplots_adjust(top=0.92, bottom=0.12)
        
        if save_path:
            plt.savefig(save_path, dpi=dpi, bbox_inches='tight', 
                       facecolor='white', edgecolor='none')
            print(f"Wykres zapisany jako: {save_path}")
        
        plt.show()
        
        return fig, (ax1, ax2)

    def plot_comparison(self, save_path=None, dpi=300, freq_range=None, 
                       log_scale=False, normalize=False, show_difference=False):
        """
        Tworzy wykres porównawczy obu metod na jednym panelu
        
        Parameters:
        -----------
        save_path : str, optional
            Ścieżka do zapisania wykresu
        dpi : int
            Rozdzielczość wykresu
        freq_range : tuple, optional
            Zakres częstotliwości (min_freq, max_freq) w GHz
        log_scale : bool
            Czy użyć skali logarytmicznej dla osi Y
        normalize : bool
            Czy znormalizować spektra do maksimum
        show_difference : bool
            Czy pokazać różnicę między metodami
        """
        self._check_calculated()
        
        # Przygotowanie danych do wykresu
        fmr1 = self.fmr_method1.copy()
        fmr2 = self.fmr_method2.copy()
        
        if normalize:
            fmr1 = fmr1 / np.max(fmr1)
            fmr2 = fmr2 / np.max(fmr2)
        
        # Określenie zakresu częstotliwości
        if freq_range:
            mask = (self.freq_ghz >= freq_range[0]) & (self.freq_ghz <= freq_range[1])
            freq_plot = self.freq_ghz[mask]
            fmr1_plot = fmr1[mask]
            fmr2_plot = fmr2[mask]
        else:
            freq_plot = self.freq_ghz[1:]  # Pomijamy DC
            fmr1_plot = fmr1[1:]
            fmr2_plot = fmr2[1:]
        
        # Tworzenie wykresu
        if show_difference:
            fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 10))
        else:
            fig, ax1 = plt.subplots(figsize=(12, 8))
        
        # Wykresy obu metod
        ax1.plot(freq_plot, fmr1_plot, 'b-', linewidth=2.5, alpha=0.8,
                label='Metoda 1: FFT → Uśrednianie')
        ax1.plot(freq_plot, fmr2_plot, 'r--', linewidth=2.5, alpha=0.8,
                label='Metoda 2: Uśrednianie → FFT')
        
        ax1.set_xlabel('Częstotliwość [GHz]', fontweight='bold')
        ylabel = 'Amplituda FFT [znorm.]' if normalize else 'Amplituda FFT [a.u.]'
        ax1.set_ylabel(ylabel, fontweight='bold')
        ax1.set_title('Porównanie spektrów FMR - Dwie metody obliczania FFT', 
                     fontweight='bold', fontsize=16, pad=20)
        
        ax1.grid(True, alpha=0.3)
        ax1.legend(frameon=True, fancybox=True, shadow=True, loc='upper right')
        
        if log_scale:
            ax1.set_yscale('log')
        else:
            ax1.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))
        
        # Wykres różnicy (jeśli wymagany)
        if show_difference:
            difference = fmr1_plot - fmr2_plot
            ax2.plot(freq_plot, difference, 'g-', linewidth=2, alpha=0.8)
            ax2.set_xlabel('Częstotliwość [GHz]', fontweight='bold')
            ax2.set_ylabel('Różnica [Metoda 1 - Metoda 2]', fontweight='bold')
            ax2.set_title('Różnica między metodami', fontweight='bold', pad=15)
            ax2.grid(True, alpha=0.3)
            ax2.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))
        
        # Dodanie informacji
        info_text = f'Δt = {self.job.t_sampl:.2e} s | Δf = {self.freq_ghz[1]:.3f} GHz | N = {self.m_z.shape[0]} pts'
        if freq_range:
            info_text += f' | Zakres: {freq_range[0]:.1f}-{freq_range[1]:.1f} GHz'
        
        ax1.text(0.02, 0.98, info_text, transform=ax1.transAxes, fontsize=11,
                verticalalignment='top', 
                bbox=dict(boxstyle="round,pad=0.3", facecolor="white", alpha=0.8))
        
        plt.tight_layout()
        
        if save_path:
            plt.savefig(save_path, dpi=dpi, bbox_inches='tight')
            print(f"Wykres porównawczy zapisany jako: {save_path}")
        
        plt.show()
        
        return fig, ax1 if not show_difference else (fig, ax1, ax2)
    
    def get_peak_frequencies(self, method=1, prominence=0.1, freq_range=None):
        """
        Znajduje częstotliwości pików w spektrum
        
        Parameters:
        -----------
        method : int
            Która metoda (1 lub 2)
        prominence : float
            Minimalna prominencja piku
        freq_range : tuple, optional
            Zakres częstotliwości do analizy
            
        Returns:
        --------
        peaks_freq : array
            Częstotliwości pików w GHz
        peaks_amp : array
            Amplitudy pików
        """
        self._check_calculated()
        from scipy.signal import find_peaks
        
        fmr_data = self.fmr_method1 if method == 1 else self.fmr_method2
        
        if freq_range:
            mask = (self.freq_ghz >= freq_range[0]) & (self.freq_ghz <= freq_range[1])
            freq_search = self.freq_ghz[mask]
            fmr_search = fmr_data[mask]
        else:
            freq_search = self.freq_ghz[1:]  # Pomijamy DC
            fmr_search = fmr_data[1:]
        
        # Znajdź piki
        peaks, properties = find_peaks(fmr_search, prominence=prominence*np.max(fmr_search))
        
        peaks_freq = freq_search[peaks]
        peaks_amp = fmr_search[peaks]
        
        print(f"Znalezione piki (Metoda {method}):")
        for i, (freq, amp) in enumerate(zip(peaks_freq, peaks_amp)):
            print(f"  Pik {i+1}: {freq:.3f} GHz, amplituda: {amp:.2e}")
        
        return peaks_freq, peaks_amp
    
    def export_data(self, filename):
        """
        Eksportuje dane spektrum do pliku CSV
        """
        self._check_calculated()
        
        data_export = np.column_stack([
            self.freq_ghz,
            self.fmr_method1,
            self.fmr_method2
        ])
        
        header = "Frequency_GHz,FFT_then_Average,Average_then_FFT"
        np.savetxt(filename, data_export, delimiter=',', header=header, comments='')
        print(f"Dane wyeksportowane do: {filename}")

# Przykład użycia:
"""
# Inicjalizacja analizatora
analyzer = FMRAnalyzer(m_z, job)

# Obliczenie FFT (tylko raz!)
analyzer.calculate_fft_data()

# Różne wykresy bez ponownego obliczania FFT
analyzer.plot_spectrum(save_path='fmr_spectrum.png')
analyzer.plot_comparison(save_path='fmr_comparison.png')
analyzer.plot_comparison(freq_range=(0, 50), log_scale=True, normalize=True)
analyzer.plot_comparison(show_difference=True)

# Analiza pików
peaks_freq, peaks_amp = analyzer.get_peak_frequencies(method=1, prominence=0.1)

# Eksport danych
analyzer.export_data('fmr_data.csv')
""", '$M_y
    
    def get_peak_frequencies(self, method=1, prominence=0.1, freq_range=None):
        """
        Znajduje częstotliwości pików w spektrum
        
        Parameters:
        -----------
        method : int
            Która metoda (1 lub 2)
        prominence : float
            Minimalna prominencja piku
        freq_range : tuple, optional
            Zakres częstotliwości do analizy
            
        Returns:
        --------
        peaks_freq : array
            Częstotliwości pików w GHz
        peaks_amp : array
            Amplitudy pików
        """
        self._check_calculated()
        from scipy.signal import find_peaks
        
        fmr_data = self.fmr_method1 if method == 1 else self.fmr_method2
        
        if freq_range:
            mask = (self.freq_ghz >= freq_range[0]) & (self.freq_ghz <= freq_range[1])
            freq_search = self.freq_ghz[mask]
            fmr_search = fmr_data[mask]
        else:
            freq_search = self.freq_ghz[1:]  # Pomijamy DC
            fmr_search = fmr_data[1:]
        
        # Znajdź piki
        peaks, properties = find_peaks(fmr_search, prominence=prominence*np.max(fmr_search))
        
        peaks_freq = freq_search[peaks]
        peaks_amp = fmr_search[peaks]
        
        print(f"Znalezione piki (Metoda {method}):")
        for i, (freq, amp) in enumerate(zip(peaks_freq, peaks_amp)):
            print(f"  Pik {i+1}: {freq:.3f} GHz, amplituda: {amp:.2e}")
        
        return peaks_freq, peaks_amp
    
    def export_data(self, filename):
        """
        Eksportuje dane spektrum do pliku CSV
        """
        self._check_calculated()
        
        data_export = np.column_stack([
            self.freq_ghz,
            self.fmr_method1,
            self.fmr_method2
        ])
        
        header = "Frequency_GHz,FFT_then_Average,Average_then_FFT"
        np.savetxt(filename, data_export, delimiter=',', header=header, comments='')
        print(f"Dane wyeksportowane do: {filename}")

# Przykład użycia:
"""
# Inicjalizacja analizatora
analyzer = FMRAnalyzer(m_z, job)

# Obliczenie FFT (tylko raz!)
analyzer.calculate_fft_data()

# Różne wykresy bez ponownego obliczania FFT
analyzer.plot_spectrum(save_path='fmr_spectrum.png')
analyzer.plot_comparison(save_path='fmr_comparison.png')
analyzer.plot_comparison(freq_range=(0, 50), log_scale=True, normalize=True)
analyzer.plot_comparison(show_difference=True)

# Analiza pików
peaks_freq, peaks_amp = analyzer.get_peak_frequencies(method=1, prominence=0.1)

# Eksport danych
analyzer.export_data('fmr_data.csv')
""", '$M_y

    def plot_comparison(self, save_path=None, dpi=300, freq_range=None, 
                       log_scale=False, normalize=False, show_difference=False):
        """
        Tworzy wykres porównawczy obu metod na jednym panelu
        
        Parameters:
        -----------
        save_path : str, optional
            Ścieżka do zapisania wykresu
        dpi : int
            Rozdzielczość wykresu
        freq_range : tuple, optional
            Zakres częstotliwości (min_freq, max_freq) w GHz
        log_scale : bool
            Czy użyć skali logarytmicznej dla osi Y
        normalize : bool
            Czy znormalizować spektra do maksimum
        show_difference : bool
            Czy pokazać różnicę między metodami
        """
        self._check_calculated()
        
        # Przygotowanie danych do wykresu
        fmr1 = self.fmr_method1.copy()
        fmr2 = self.fmr_method2.copy()
        
        if normalize:
            fmr1 = fmr1 / np.max(fmr1)
            fmr2 = fmr2 / np.max(fmr2)
        
        # Określenie zakresu częstotliwości
        if freq_range:
            mask = (self.freq_ghz >= freq_range[0]) & (self.freq_ghz <= freq_range[1])
            freq_plot = self.freq_ghz[mask]
            fmr1_plot = fmr1[mask]
            fmr2_plot = fmr2[mask]
        else:
            freq_plot = self.freq_ghz[1:]  # Pomijamy DC
            fmr1_plot = fmr1[1:]
            fmr2_plot = fmr2[1:]
        
        # Tworzenie wykresu
        if show_difference:
            fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 10))
        else:
            fig, ax1 = plt.subplots(figsize=(12, 8))
        
        # Wykresy obu metod
        ax1.plot(freq_plot, fmr1_plot, 'b-', linewidth=2.5, alpha=0.8,
                label='Metoda 1: FFT → Uśrednianie')
        ax1.plot(freq_plot, fmr2_plot, 'r--', linewidth=2.5, alpha=0.8,
                label='Metoda 2: Uśrednianie → FFT')
        
        ax1.set_xlabel('Częstotliwość [GHz]', fontweight='bold')
        ylabel = 'Amplituda FFT [znorm.]' if normalize else 'Amplituda FFT [a.u.]'
        ax1.set_ylabel(ylabel, fontweight='bold')
        ax1.set_title('Porównanie spektrów FMR - Dwie metody obliczania FFT', 
                     fontweight='bold', fontsize=16, pad=20)
        
        ax1.grid(True, alpha=0.3)
        ax1.legend(frameon=True, fancybox=True, shadow=True, loc='upper right')
        
        if log_scale:
            ax1.set_yscale('log')
        else:
            ax1.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))
        
        # Wykres różnicy (jeśli wymagany)
        if show_difference:
            difference = fmr1_plot - fmr2_plot
            ax2.plot(freq_plot, difference, 'g-', linewidth=2, alpha=0.8)
            ax2.set_xlabel('Częstotliwość [GHz]', fontweight='bold')
            ax2.set_ylabel('Różnica [Metoda 1 - Metoda 2]', fontweight='bold')
            ax2.set_title('Różnica między metodami', fontweight='bold', pad=15)
            ax2.grid(True, alpha=0.3)
            ax2.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))
        
        # Dodanie informacji
        info_text = f'Δt = {self.job.t_sampl:.2e} s | Δf = {self.freq_ghz[1]:.3f} GHz | N = {self.m_z.shape[0]} pts'
        if freq_range:
            info_text += f' | Zakres: {freq_range[0]:.1f}-{freq_range[1]:.1f} GHz'
        
        ax1.text(0.02, 0.98, info_text, transform=ax1.transAxes, fontsize=11,
                verticalalignment='top', 
                bbox=dict(boxstyle="round,pad=0.3", facecolor="white", alpha=0.8))
        
        plt.tight_layout()
        
        if save_path:
            plt.savefig(save_path, dpi=dpi, bbox_inches='tight')
            print(f"Wykres porównawczy zapisany jako: {save_path}")
        
        plt.show()
        
        return fig, ax1 if not show_difference else (fig, ax1, ax2)
    
    def get_peak_frequencies(self, method=1, prominence=0.1, freq_range=None):
        """
        Znajduje częstotliwości pików w spektrum
        
        Parameters:
        -----------
        method : int
            Która metoda (1 lub 2)
        prominence : float
            Minimalna prominencja piku
        freq_range : tuple, optional
            Zakres częstotliwości do analizy
            
        Returns:
        --------
        peaks_freq : array
            Częstotliwości pików w GHz
        peaks_amp : array
            Amplitudy pików
        """
        self._check_calculated()
        from scipy.signal import find_peaks
        
        fmr_data = self.fmr_method1 if method == 1 else self.fmr_method2
        
        if freq_range:
            mask = (self.freq_ghz >= freq_range[0]) & (self.freq_ghz <= freq_range[1])
            freq_search = self.freq_ghz[mask]
            fmr_search = fmr_data[mask]
        else:
            freq_search = self.freq_ghz[1:]  # Pomijamy DC
            fmr_search = fmr_data[1:]
        
        # Znajdź piki
        peaks, properties = find_peaks(fmr_search, prominence=prominence*np.max(fmr_search))
        
        peaks_freq = freq_search[peaks]
        peaks_amp = fmr_search[peaks]
        
        print(f"Znalezione piki (Metoda {method}):")
        for i, (freq, amp) in enumerate(zip(peaks_freq, peaks_amp)):
            print(f"  Pik {i+1}: {freq:.3f} GHz, amplituda: {amp:.2e}")
        
        return peaks_freq, peaks_amp
    
    def export_data(self, filename):
        """
        Eksportuje dane spektrum do pliku CSV
        """
        self._check_calculated()
        
        data_export = np.column_stack([
            self.freq_ghz,
            self.fmr_method1,
            self.fmr_method2
        ])
        
        header = "Frequency_GHz,FFT_then_Average,Average_then_FFT"
        np.savetxt(filename, data_export, delimiter=',', header=header, comments='')
        print(f"Dane wyeksportowane do: {filename}")

# Przykład użycia:
"""
# Inicjalizacja analizatora
analyzer = FMRAnalyzer(m_z, job)

# Obliczenie FFT (tylko raz!)
analyzer.calculate_fft_data()

# Różne wykresy bez ponownego obliczania FFT
analyzer.plot_spectrum(save_path='fmr_spectrum.png')
analyzer.plot_comparison(save_path='fmr_comparison.png')
analyzer.plot_comparison(freq_range=(0, 50), log_scale=True, normalize=True)
analyzer.plot_comparison(show_difference=True)

# Analiza pików
peaks_freq, peaks_amp = analyzer.get_peak_frequencies(method=1, prominence=0.1)

# Eksport danych
analyzer.export_data('fmr_data.csv')
""", '$M_z

    def plot_comparison(self, save_path=None, dpi=300, freq_range=None, 
                       log_scale=False, normalize=False, show_difference=False):
        """
        Tworzy wykres porównawczy obu metod na jednym panelu
        
        Parameters:
        -----------
        save_path : str, optional
            Ścieżka do zapisania wykresu
        dpi : int
            Rozdzielczość wykresu
        freq_range : tuple, optional
            Zakres częstotliwości (min_freq, max_freq) w GHz
        log_scale : bool
            Czy użyć skali logarytmicznej dla osi Y
        normalize : bool
            Czy znormalizować spektra do maksimum
        show_difference : bool
            Czy pokazać różnicę między metodami
        """
        self._check_calculated()
        
        # Przygotowanie danych do wykresu
        fmr1 = self.fmr_method1.copy()
        fmr2 = self.fmr_method2.copy()
        
        if normalize:
            fmr1 = fmr1 / np.max(fmr1)
            fmr2 = fmr2 / np.max(fmr2)
        
        # Określenie zakresu częstotliwości
        if freq_range:
            mask = (self.freq_ghz >= freq_range[0]) & (self.freq_ghz <= freq_range[1])
            freq_plot = self.freq_ghz[mask]
            fmr1_plot = fmr1[mask]
            fmr2_plot = fmr2[mask]
        else:
            freq_plot = self.freq_ghz[1:]  # Pomijamy DC
            fmr1_plot = fmr1[1:]
            fmr2_plot = fmr2[1:]
        
        # Tworzenie wykresu
        if show_difference:
            fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 10))
        else:
            fig, ax1 = plt.subplots(figsize=(12, 8))
        
        # Wykresy obu metod
        ax1.plot(freq_plot, fmr1_plot, 'b-', linewidth=2.5, alpha=0.8,
                label='Metoda 1: FFT → Uśrednianie')
        ax1.plot(freq_plot, fmr2_plot, 'r--', linewidth=2.5, alpha=0.8,
                label='Metoda 2: Uśrednianie → FFT')
        
        ax1.set_xlabel('Częstotliwość [GHz]', fontweight='bold')
        ylabel = 'Amplituda FFT [znorm.]' if normalize else 'Amplituda FFT [a.u.]'
        ax1.set_ylabel(ylabel, fontweight='bold')
        ax1.set_title('Porównanie spektrów FMR - Dwie metody obliczania FFT', 
                     fontweight='bold', fontsize=16, pad=20)
        
        ax1.grid(True, alpha=0.3)
        ax1.legend(frameon=True, fancybox=True, shadow=True, loc='upper right')
        
        if log_scale:
            ax1.set_yscale('log')
        else:
            ax1.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))
        
        # Wykres różnicy (jeśli wymagany)
        if show_difference:
            difference = fmr1_plot - fmr2_plot
            ax2.plot(freq_plot, difference, 'g-', linewidth=2, alpha=0.8)
            ax2.set_xlabel('Częstotliwość [GHz]', fontweight='bold')
            ax2.set_ylabel('Różnica [Metoda 1 - Metoda 2]', fontweight='bold')
            ax2.set_title('Różnica między metodami', fontweight='bold', pad=15)
            ax2.grid(True, alpha=0.3)
            ax2.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))
        
        # Dodanie informacji
        info_text = f'Δt = {self.job.t_sampl:.2e} s | Δf = {self.freq_ghz[1]:.3f} GHz | N = {self.m_z.shape[0]} pts'
        if freq_range:
            info_text += f' | Zakres: {freq_range[0]:.1f}-{freq_range[1]:.1f} GHz'
        
        ax1.text(0.02, 0.98, info_text, transform=ax1.transAxes, fontsize=11,
                verticalalignment='top', 
                bbox=dict(boxstyle="round,pad=0.3", facecolor="white", alpha=0.8))
        
        plt.tight_layout()
        
        if save_path:
            plt.savefig(save_path, dpi=dpi, bbox_inches='tight')
            print(f"Wykres porównawczy zapisany jako: {save_path}")
        
        plt.show()
        
        return fig, ax1 if not show_difference else (fig, ax1, ax2)
    
    def get_peak_frequencies(self, method=1, prominence=0.1, freq_range=None):
        """
        Znajduje częstotliwości pików w spektrum
        
        Parameters:
        -----------
        method : int
            Która metoda (1 lub 2)
        prominence : float
            Minimalna prominencja piku
        freq_range : tuple, optional
            Zakres częstotliwości do analizy
            
        Returns:
        --------
        peaks_freq : array
            Częstotliwości pików w GHz
        peaks_amp : array
            Amplitudy pików
        """
        self._check_calculated()
        from scipy.signal import find_peaks
        
        fmr_data = self.fmr_method1 if method == 1 else self.fmr_method2
        
        if freq_range:
            mask = (self.freq_ghz >= freq_range[0]) & (self.freq_ghz <= freq_range[1])
            freq_search = self.freq_ghz[mask]
            fmr_search = fmr_data[mask]
        else:
            freq_search = self.freq_ghz[1:]  # Pomijamy DC
            fmr_search = fmr_data[1:]
        
        # Znajdź piki
        peaks, properties = find_peaks(fmr_search, prominence=prominence*np.max(fmr_search))
        
        peaks_freq = freq_search[peaks]
        peaks_amp = fmr_search[peaks]
        
        print(f"Znalezione piki (Metoda {method}):")
        for i, (freq, amp) in enumerate(zip(peaks_freq, peaks_amp)):
            print(f"  Pik {i+1}: {freq:.3f} GHz, amplituda: {amp:.2e}")
        
        return peaks_freq, peaks_amp
    
    def export_data(self, filename):
        """
        Eksportuje dane spektrum do pliku CSV
        """
        self._check_calculated()
        
        data_export = np.column_stack([
            self.freq_ghz,
            self.fmr_method1,
            self.fmr_method2
        ])
        
        header = "Frequency_GHz,FFT_then_Average,Average_then_FFT"
        np.savetxt(filename, data_export, delimiter=',', header=header, comments='')
        print(f"Dane wyeksportowane do: {filename}")

# Przykład użycia:
"""
# Inicjalizacja analizatora
analyzer = FMRAnalyzer(m_z, job)

# Obliczenie FFT (tylko raz!)
analyzer.calculate_fft_data()

# Różne wykresy bez ponownego obliczania FFT
analyzer.plot_spectrum(save_path='fmr_spectrum.png')
analyzer.plot_comparison(save_path='fmr_comparison.png')
analyzer.plot_comparison(freq_range=(0, 50), log_scale=True, normalize=True)
analyzer.plot_comparison(show_difference=True)

# Analiza pików
peaks_freq, peaks_amp = analyzer.get_peak_frequencies(method=1, prominence=0.1)

# Eksport danych
analyzer.export_data('fmr_data.csv')
"""]
            
            # Wykres 1: Metoda 1
            for i in range(3):
                data_plot = fmr1_plot[:, i] if has_components else fmr1_plot
                ax1.plot(freq_plot, data_plot, color=colors_comp[i], 
                        linewidth=2, alpha=0.8, label=labels[i])
                
            # Wykres 2: Metoda 2  
            for i in range(3):
                data_plot = fmr2_plot[:, i] if has_components else fmr2_plot
                ax2.plot(freq_plot, data_plot, color=colors_comp[i], 
                        linewidth=2, alpha=0.8, label=labels[i])
        else:
            # Pojedyncze krzywe
            ax1.plot(freq_plot, fmr1_plot, color=generate_pastel_colors(1)[0], 
                    linewidth=2, alpha=0.8, label='FFT → Uśrednianie')
            ax2.plot(freq_plot, fmr2_plot, color=generate_pastel_colors(1)[0], 
                    linewidth=2, alpha=0.8, label='Uśrednianie → FFT')
        
        # Formatowanie osi i etykiet
        for ax, title in zip([ax1, ax2], 
                           ['Metoda 1: FFT dla każdego punktu, następnie uśrednianie',
                            'Metoda 2: Uśrednianie przestrzenne, następnie FFT']):
            ax.set_xlabel('Częstotliwość [GHz]')
            ylabel = 'Amplituda FFT [znorm.]' if normalize else 'Amplituda FFT [a.u.]'
            ax.set_ylabel(ylabel)
            ax.set_title(title, fontweight='bold', pad=15)
            ax.grid(True, alpha=0.3)
            ax.legend(frameon=True, fancybox=True, shadow=True)
            
            if log_scale:
                ax.set_yscale('log')
            else:
                ax.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))
        
        # Dodanie informacji o parametrach
        info_text = f'Krok czasowy: {self.job.t_sampl:.2e} s\n'
        info_text += f'Rozdzielczość częstotliwościowa: {self.freq_ghz[1]:.3f} GHz\n'
        info_text += f'Liczba punktów czasowych: {self.m_z.shape[0]}\n'
        if freq_range:
            info_text += f'Zakres częstotliwości: {freq_range[0]:.1f} - {freq_range[1]:.1f} GHz'
        
        fig.text(0.02, 0.02, info_text, fontsize=8, 
                 bbox=dict(boxstyle="round,pad=0.3", facecolor="lightgray", alpha=0.7))
        
        plt.tight_layout()
        plt.subplots_adjust(top=0.92, bottom=0.12)
        
        if save_path:
            plt.savefig(save_path, dpi=dpi, bbox_inches='tight', 
                       facecolor='white', edgecolor='none')
            print(f"Wykres zapisany jako: {save_path}")
        
        plt.show()
        
        return fig, (ax1, ax2)

    def plot_comparison(self, save_path=None, dpi=300, freq_range=None, 
                       log_scale=False, normalize=False, show_difference=False):
        """
        Tworzy wykres porównawczy obu metod na jednym panelu
        
        Parameters:
        -----------
        save_path : str, optional
            Ścieżka do zapisania wykresu
        dpi : int
            Rozdzielczość wykresu
        freq_range : tuple, optional
            Zakres częstotliwości (min_freq, max_freq) w GHz
        log_scale : bool
            Czy użyć skali logarytmicznej dla osi Y
        normalize : bool
            Czy znormalizować spektra do maksimum
        show_difference : bool
            Czy pokazać różnicę między metodami
        """
        self._check_calculated()
        
        # Przygotowanie danych do wykresu
        fmr1 = self.fmr_method1.copy()
        fmr2 = self.fmr_method2.copy()
        
        if normalize:
            fmr1 = fmr1 / np.max(fmr1)
            fmr2 = fmr2 / np.max(fmr2)
        
        # Określenie zakresu częstotliwości
        if freq_range:
            mask = (self.freq_ghz >= freq_range[0]) & (self.freq_ghz <= freq_range[1])
            freq_plot = self.freq_ghz[mask]
            fmr1_plot = fmr1[mask]
            fmr2_plot = fmr2[mask]
        else:
            freq_plot = self.freq_ghz[1:]  # Pomijamy DC
            fmr1_plot = fmr1[1:]
            fmr2_plot = fmr2[1:]
        
        # Tworzenie wykresu
        if show_difference:
            fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 10))
        else:
            fig, ax1 = plt.subplots(figsize=(12, 8))
        
        # Wykresy obu metod
        ax1.plot(freq_plot, fmr1_plot, 'b-', linewidth=2.5, alpha=0.8,
                label='Metoda 1: FFT → Uśrednianie')
        ax1.plot(freq_plot, fmr2_plot, 'r--', linewidth=2.5, alpha=0.8,
                label='Metoda 2: Uśrednianie → FFT')
        
        ax1.set_xlabel('Częstotliwość [GHz]', fontweight='bold')
        ylabel = 'Amplituda FFT [znorm.]' if normalize else 'Amplituda FFT [a.u.]'
        ax1.set_ylabel(ylabel, fontweight='bold')
        ax1.set_title('Porównanie spektrów FMR - Dwie metody obliczania FFT', 
                     fontweight='bold', fontsize=16, pad=20)
        
        ax1.grid(True, alpha=0.3)
        ax1.legend(frameon=True, fancybox=True, shadow=True, loc='upper right')
        
        if log_scale:
            ax1.set_yscale('log')
        else:
            ax1.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))
        
        # Wykres różnicy (jeśli wymagany)
        if show_difference:
            difference = fmr1_plot - fmr2_plot
            ax2.plot(freq_plot, difference, 'g-', linewidth=2, alpha=0.8)
            ax2.set_xlabel('Częstotliwość [GHz]', fontweight='bold')
            ax2.set_ylabel('Różnica [Metoda 1 - Metoda 2]', fontweight='bold')
            ax2.set_title('Różnica między metodami', fontweight='bold', pad=15)
            ax2.grid(True, alpha=0.3)
            ax2.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))
        
        # Dodanie informacji
        info_text = f'Δt = {self.job.t_sampl:.2e} s | Δf = {self.freq_ghz[1]:.3f} GHz | N = {self.m_z.shape[0]} pts'
        if freq_range:
            info_text += f' | Zakres: {freq_range[0]:.1f}-{freq_range[1]:.1f} GHz'
        
        ax1.text(0.02, 0.98, info_text, transform=ax1.transAxes, fontsize=11,
                verticalalignment='top', 
                bbox=dict(boxstyle="round,pad=0.3", facecolor="white", alpha=0.8))
        
        plt.tight_layout()
        
        if save_path:
            plt.savefig(save_path, dpi=dpi, bbox_inches='tight')
            print(f"Wykres porównawczy zapisany jako: {save_path}")
        
        plt.show()
        
        return fig, ax1 if not show_difference else (fig, ax1, ax2)
    
    def get_peak_frequencies(self, method=1, prominence=0.1, freq_range=None):
        """
        Znajduje częstotliwości pików w spektrum
        
        Parameters:
        -----------
        method : int
            Która metoda (1 lub 2)
        prominence : float
            Minimalna prominencja piku
        freq_range : tuple, optional
            Zakres częstotliwości do analizy
            
        Returns:
        --------
        peaks_freq : array
            Częstotliwości pików w GHz
        peaks_amp : array
            Amplitudy pików
        """
        self._check_calculated()
        from scipy.signal import find_peaks
        
        fmr_data = self.fmr_method1 if method == 1 else self.fmr_method2
        
        if freq_range:
            mask = (self.freq_ghz >= freq_range[0]) & (self.freq_ghz <= freq_range[1])
            freq_search = self.freq_ghz[mask]
            fmr_search = fmr_data[mask]
        else:
            freq_search = self.freq_ghz[1:]  # Pomijamy DC
            fmr_search = fmr_data[1:]
        
        # Znajdź piki
        peaks, properties = find_peaks(fmr_search, prominence=prominence*np.max(fmr_search))
        
        peaks_freq = freq_search[peaks]
        peaks_amp = fmr_search[peaks]
        
        print(f"Znalezione piki (Metoda {method}):")
        for i, (freq, amp) in enumerate(zip(peaks_freq, peaks_amp)):
            print(f"  Pik {i+1}: {freq:.3f} GHz, amplituda: {amp:.2e}")
        
        return peaks_freq, peaks_amp
    
    def export_data(self, filename):
        """
        Eksportuje dane spektrum do pliku CSV
        """
        self._check_calculated()
        
        data_export = np.column_stack([
            self.freq_ghz,
            self.fmr_method1,
            self.fmr_method2
        ])
        
        header = "Frequency_GHz,FFT_then_Average,Average_then_FFT"
        np.savetxt(filename, data_export, delimiter=',', header=header, comments='')
        print(f"Dane wyeksportowane do: {filename}")

# Przykład użycia:
"""
# Inicjalizacja analizatora
analyzer = FMRAnalyzer(m_z, job)

# Obliczenie FFT (tylko raz!)
analyzer.calculate_fft_data()

# Różne wykresy bez ponownego obliczania FFT
analyzer.plot_spectrum(save_path='fmr_spectrum.png')
analyzer.plot_comparison(save_path='fmr_comparison.png')
analyzer.plot_comparison(freq_range=(0, 50), log_scale=True, normalize=True)
analyzer.plot_comparison(show_difference=True)

# Analiza pików
peaks_freq, peaks_amp = analyzer.get_peak_frequencies(method=1, prominence=0.1)

# Eksport danych
analyzer.export_data('fmr_data.csv')
""", '$M_z
    
    def get_peak_frequencies(self, method=1, prominence=0.1, freq_range=None):
        """
        Znajduje częstotliwości pików w spektrum
        
        Parameters:
        -----------
        method : int
            Która metoda (1 lub 2)
        prominence : float
            Minimalna prominencja piku
        freq_range : tuple, optional
            Zakres częstotliwości do analizy
            
        Returns:
        --------
        peaks_freq : array
            Częstotliwości pików w GHz
        peaks_amp : array
            Amplitudy pików
        """
        self._check_calculated()
        from scipy.signal import find_peaks
        
        fmr_data = self.fmr_method1 if method == 1 else self.fmr_method2
        
        if freq_range:
            mask = (self.freq_ghz >= freq_range[0]) & (self.freq_ghz <= freq_range[1])
            freq_search = self.freq_ghz[mask]
            fmr_search = fmr_data[mask]
        else:
            freq_search = self.freq_ghz[1:]  # Pomijamy DC
            fmr_search = fmr_data[1:]
        
        # Znajdź piki
        peaks, properties = find_peaks(fmr_search, prominence=prominence*np.max(fmr_search))
        
        peaks_freq = freq_search[peaks]
        peaks_amp = fmr_search[peaks]
        
        print(f"Znalezione piki (Metoda {method}):")
        for i, (freq, amp) in enumerate(zip(peaks_freq, peaks_amp)):
            print(f"  Pik {i+1}: {freq:.3f} GHz, amplituda: {amp:.2e}")
        
        return peaks_freq, peaks_amp
    
    def export_data(self, filename):
        """
        Eksportuje dane spektrum do pliku CSV
        """
        self._check_calculated()
        
        data_export = np.column_stack([
            self.freq_ghz,
            self.fmr_method1,
            self.fmr_method2
        ])
        
        header = "Frequency_GHz,FFT_then_Average,Average_then_FFT"
        np.savetxt(filename, data_export, delimiter=',', header=header, comments='')
        print(f"Dane wyeksportowane do: {filename}")

# Przykład użycia:
"""
# Inicjalizacja analizatora
analyzer = FMRAnalyzer(m_z, job)

# Obliczenie FFT (tylko raz!)
analyzer.calculate_fft_data()

# Różne wykresy bez ponownego obliczania FFT
analyzer.plot_spectrum(save_path='fmr_spectrum.png')
analyzer.plot_comparison(save_path='fmr_comparison.png')
analyzer.plot_comparison(freq_range=(0, 50), log_scale=True, normalize=True)
analyzer.plot_comparison(show_difference=True)

# Analiza pików
peaks_freq, peaks_amp = analyzer.get_peak_frequencies(method=1, prominence=0.1)

# Eksport danych
analyzer.export_data('fmr_data.csv')
""", '$M_y

    def plot_comparison(self, save_path=None, dpi=300, freq_range=None, 
                       log_scale=False, normalize=False, show_difference=False):
        """
        Tworzy wykres porównawczy obu metod na jednym panelu
        
        Parameters:
        -----------
        save_path : str, optional
            Ścieżka do zapisania wykresu
        dpi : int
            Rozdzielczość wykresu
        freq_range : tuple, optional
            Zakres częstotliwości (min_freq, max_freq) w GHz
        log_scale : bool
            Czy użyć skali logarytmicznej dla osi Y
        normalize : bool
            Czy znormalizować spektra do maksimum
        show_difference : bool
            Czy pokazać różnicę między metodami
        """
        self._check_calculated()
        
        # Przygotowanie danych do wykresu
        fmr1 = self.fmr_method1.copy()
        fmr2 = self.fmr_method2.copy()
        
        if normalize:
            fmr1 = fmr1 / np.max(fmr1)
            fmr2 = fmr2 / np.max(fmr2)
        
        # Określenie zakresu częstotliwości
        if freq_range:
            mask = (self.freq_ghz >= freq_range[0]) & (self.freq_ghz <= freq_range[1])
            freq_plot = self.freq_ghz[mask]
            fmr1_plot = fmr1[mask]
            fmr2_plot = fmr2[mask]
        else:
            freq_plot = self.freq_ghz[1:]  # Pomijamy DC
            fmr1_plot = fmr1[1:]
            fmr2_plot = fmr2[1:]
        
        # Tworzenie wykresu
        if show_difference:
            fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 10))
        else:
            fig, ax1 = plt.subplots(figsize=(12, 8))
        
        # Wykresy obu metod
        ax1.plot(freq_plot, fmr1_plot, 'b-', linewidth=2.5, alpha=0.8,
                label='Metoda 1: FFT → Uśrednianie')
        ax1.plot(freq_plot, fmr2_plot, 'r--', linewidth=2.5, alpha=0.8,
                label='Metoda 2: Uśrednianie → FFT')
        
        ax1.set_xlabel('Częstotliwość [GHz]', fontweight='bold')
        ylabel = 'Amplituda FFT [znorm.]' if normalize else 'Amplituda FFT [a.u.]'
        ax1.set_ylabel(ylabel, fontweight='bold')
        ax1.set_title('Porównanie spektrów FMR - Dwie metody obliczania FFT', 
                     fontweight='bold', fontsize=16, pad=20)
        
        ax1.grid(True, alpha=0.3)
        ax1.legend(frameon=True, fancybox=True, shadow=True, loc='upper right')
        
        if log_scale:
            ax1.set_yscale('log')
        else:
            ax1.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))
        
        # Wykres różnicy (jeśli wymagany)
        if show_difference:
            difference = fmr1_plot - fmr2_plot
            ax2.plot(freq_plot, difference, 'g-', linewidth=2, alpha=0.8)
            ax2.set_xlabel('Częstotliwość [GHz]', fontweight='bold')
            ax2.set_ylabel('Różnica [Metoda 1 - Metoda 2]', fontweight='bold')
            ax2.set_title('Różnica między metodami', fontweight='bold', pad=15)
            ax2.grid(True, alpha=0.3)
            ax2.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))
        
        # Dodanie informacji
        info_text = f'Δt = {self.job.t_sampl:.2e} s | Δf = {self.freq_ghz[1]:.3f} GHz | N = {self.m_z.shape[0]} pts'
        if freq_range:
            info_text += f' | Zakres: {freq_range[0]:.1f}-{freq_range[1]:.1f} GHz'
        
        ax1.text(0.02, 0.98, info_text, transform=ax1.transAxes, fontsize=11,
                verticalalignment='top', 
                bbox=dict(boxstyle="round,pad=0.3", facecolor="white", alpha=0.8))
        
        plt.tight_layout()
        
        if save_path:
            plt.savefig(save_path, dpi=dpi, bbox_inches='tight')
            print(f"Wykres porównawczy zapisany jako: {save_path}")
        
        plt.show()
        
        return fig, ax1 if not show_difference else (fig, ax1, ax2)
    
    def get_peak_frequencies(self, method=1, prominence=0.1, freq_range=None):
        """
        Znajduje częstotliwości pików w spektrum
        
        Parameters:
        -----------
        method : int
            Która metoda (1 lub 2)
        prominence : float
            Minimalna prominencja piku
        freq_range : tuple, optional
            Zakres częstotliwości do analizy
            
        Returns:
        --------
        peaks_freq : array
            Częstotliwości pików w GHz
        peaks_amp : array
            Amplitudy pików
        """
        self._check_calculated()
        from scipy.signal import find_peaks
        
        fmr_data = self.fmr_method1 if method == 1 else self.fmr_method2
        
        if freq_range:
            mask = (self.freq_ghz >= freq_range[0]) & (self.freq_ghz <= freq_range[1])
            freq_search = self.freq_ghz[mask]
            fmr_search = fmr_data[mask]
        else:
            freq_search = self.freq_ghz[1:]  # Pomijamy DC
            fmr_search = fmr_data[1:]
        
        # Znajdź piki
        peaks, properties = find_peaks(fmr_search, prominence=prominence*np.max(fmr_search))
        
        peaks_freq = freq_search[peaks]
        peaks_amp = fmr_search[peaks]
        
        print(f"Znalezione piki (Metoda {method}):")
        for i, (freq, amp) in enumerate(zip(peaks_freq, peaks_amp)):
            print(f"  Pik {i+1}: {freq:.3f} GHz, amplituda: {amp:.2e}")
        
        return peaks_freq, peaks_amp
    
    def export_data(self, filename):
        """
        Eksportuje dane spektrum do pliku CSV
        """
        self._check_calculated()
        
        data_export = np.column_stack([
            self.freq_ghz,
            self.fmr_method1,
            self.fmr_method2
        ])
        
        header = "Frequency_GHz,FFT_then_Average,Average_then_FFT"
        np.savetxt(filename, data_export, delimiter=',', header=header, comments='')
        print(f"Dane wyeksportowane do: {filename}")

# Przykład użycia:
"""
# Inicjalizacja analizatora
analyzer = FMRAnalyzer(m_z, job)

# Obliczenie FFT (tylko raz!)
analyzer.calculate_fft_data()

# Różne wykresy bez ponownego obliczania FFT
analyzer.plot_spectrum(save_path='fmr_spectrum.png')
analyzer.plot_comparison(save_path='fmr_comparison.png')
analyzer.plot_comparison(freq_range=(0, 50), log_scale=True, normalize=True)
analyzer.plot_comparison(show_difference=True)

# Analiza pików
peaks_freq, peaks_amp = analyzer.get_peak_frequencies(method=1, prominence=0.1)

# Eksport danych
analyzer.export_data('fmr_data.csv')
""", '$M_z

    def plot_comparison(self, save_path=None, dpi=300, freq_range=None, 
                       log_scale=False, normalize=False, show_difference=False):
        """
        Tworzy wykres porównawczy obu metod na jednym panelu
        
        Parameters:
        -----------
        save_path : str, optional
            Ścieżka do zapisania wykresu
        dpi : int
            Rozdzielczość wykresu
        freq_range : tuple, optional
            Zakres częstotliwości (min_freq, max_freq) w GHz
        log_scale : bool
            Czy użyć skali logarytmicznej dla osi Y
        normalize : bool
            Czy znormalizować spektra do maksimum
        show_difference : bool
            Czy pokazać różnicę między metodami
        """
        self._check_calculated()
        
        # Przygotowanie danych do wykresu
        fmr1 = self.fmr_method1.copy()
        fmr2 = self.fmr_method2.copy()
        
        if normalize:
            fmr1 = fmr1 / np.max(fmr1)
            fmr2 = fmr2 / np.max(fmr2)
        
        # Określenie zakresu częstotliwości
        if freq_range:
            mask = (self.freq_ghz >= freq_range[0]) & (self.freq_ghz <= freq_range[1])
            freq_plot = self.freq_ghz[mask]
            fmr1_plot = fmr1[mask]
            fmr2_plot = fmr2[mask]
        else:
            freq_plot = self.freq_ghz[1:]  # Pomijamy DC
            fmr1_plot = fmr1[1:]
            fmr2_plot = fmr2[1:]
        
        # Tworzenie wykresu
        if show_difference:
            fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 10))
        else:
            fig, ax1 = plt.subplots(figsize=(12, 8))
        
        # Wykresy obu metod
        ax1.plot(freq_plot, fmr1_plot, 'b-', linewidth=2.5, alpha=0.8,
                label='Metoda 1: FFT → Uśrednianie')
        ax1.plot(freq_plot, fmr2_plot, 'r--', linewidth=2.5, alpha=0.8,
                label='Metoda 2: Uśrednianie → FFT')
        
        ax1.set_xlabel('Częstotliwość [GHz]', fontweight='bold')
        ylabel = 'Amplituda FFT [znorm.]' if normalize else 'Amplituda FFT [a.u.]'
        ax1.set_ylabel(ylabel, fontweight='bold')
        ax1.set_title('Porównanie spektrów FMR - Dwie metody obliczania FFT', 
                     fontweight='bold', fontsize=16, pad=20)
        
        ax1.grid(True, alpha=0.3)
        ax1.legend(frameon=True, fancybox=True, shadow=True, loc='upper right')
        
        if log_scale:
            ax1.set_yscale('log')
        else:
            ax1.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))
        
        # Wykres różnicy (jeśli wymagany)
        if show_difference:
            difference = fmr1_plot - fmr2_plot
            ax2.plot(freq_plot, difference, 'g-', linewidth=2, alpha=0.8)
            ax2.set_xlabel('Częstotliwość [GHz]', fontweight='bold')
            ax2.set_ylabel('Różnica [Metoda 1 - Metoda 2]', fontweight='bold')
            ax2.set_title('Różnica między metodami', fontweight='bold', pad=15)
            ax2.grid(True, alpha=0.3)
            ax2.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))
        
        # Dodanie informacji
        info_text = f'Δt = {self.job.t_sampl:.2e} s | Δf = {self.freq_ghz[1]:.3f} GHz | N = {self.m_z.shape[0]} pts'
        if freq_range:
            info_text += f' | Zakres: {freq_range[0]:.1f}-{freq_range[1]:.1f} GHz'
        
        ax1.text(0.02, 0.98, info_text, transform=ax1.transAxes, fontsize=11,
                verticalalignment='top', 
                bbox=dict(boxstyle="round,pad=0.3", facecolor="white", alpha=0.8))
        
        plt.tight_layout()
        
        if save_path:
            plt.savefig(save_path, dpi=dpi, bbox_inches='tight')
            print(f"Wykres porównawczy zapisany jako: {save_path}")
        
        plt.show()
        
        return fig, ax1 if not show_difference else (fig, ax1, ax2)
    
    def get_peak_frequencies(self, method=1, prominence=0.1, freq_range=None):
        """
        Znajduje częstotliwości pików w spektrum
        
        Parameters:
        -----------
        method : int
            Która metoda (1 lub 2)
        prominence : float
            Minimalna prominencja piku
        freq_range : tuple, optional
            Zakres częstotliwości do analizy
            
        Returns:
        --------
        peaks_freq : array
            Częstotliwości pików w GHz
        peaks_amp : array
            Amplitudy pików
        """
        self._check_calculated()
        from scipy.signal import find_peaks
        
        fmr_data = self.fmr_method1 if method == 1 else self.fmr_method2
        
        if freq_range:
            mask = (self.freq_ghz >= freq_range[0]) & (self.freq_ghz <= freq_range[1])
            freq_search = self.freq_ghz[mask]
            fmr_search = fmr_data[mask]
        else:
            freq_search = self.freq_ghz[1:]  # Pomijamy DC
            fmr_search = fmr_data[1:]
        
        # Znajdź piki
        peaks, properties = find_peaks(fmr_search, prominence=prominence*np.max(fmr_search))
        
        peaks_freq = freq_search[peaks]
        peaks_amp = fmr_search[peaks]
        
        print(f"Znalezione piki (Metoda {method}):")
        for i, (freq, amp) in enumerate(zip(peaks_freq, peaks_amp)):
            print(f"  Pik {i+1}: {freq:.3f} GHz, amplituda: {amp:.2e}")
        
        return peaks_freq, peaks_amp
    
    def export_data(self, filename):
        """
        Eksportuje dane spektrum do pliku CSV
        """
        self._check_calculated()
        
        data_export = np.column_stack([
            self.freq_ghz,
            self.fmr_method1,
            self.fmr_method2
        ])
        
        header = "Frequency_GHz,FFT_then_Average,Average_then_FFT"
        np.savetxt(filename, data_export, delimiter=',', header=header, comments='')
        print(f"Dane wyeksportowane do: {filename}")

# Przykład użycia:
"""
# Inicjalizacja analizatora
analyzer = FMRAnalyzer(m_z, job)

# Obliczenie FFT (tylko raz!)
analyzer.calculate_fft_data()

# Różne wykresy bez ponownego obliczania FFT
analyzer.plot_spectrum(save_path='fmr_spectrum.png')
analyzer.plot_comparison(save_path='fmr_comparison.png')
analyzer.plot_comparison(freq_range=(0, 50), log_scale=True, normalize=True)
analyzer.plot_comparison(show_difference=True)

# Analiza pików
peaks_freq, peaks_amp = analyzer.get_peak_frequencies(method=1, prominence=0.1)

# Eksport danych
analyzer.export_data('fmr_data.csv')
"""]
            
            # Wykres 1: Metoda 1
            for i in range(3):
                data_plot = fmr1_plot[:, i] if has_components else fmr1_plot
                ax1.plot(freq_plot, data_plot, color=colors_comp[i], 
                        linewidth=2, alpha=0.8, label=labels[i])
                
            # Wykres 2: Metoda 2  
            for i in range(3):
                data_plot = fmr2_plot[:, i] if has_components else fmr2_plot
                ax2.plot(freq_plot, data_plot, color=colors_comp[i], 
                        linewidth=2, alpha=0.8, label=labels[i])
        else:
            # Pojedyncze krzywe
            ax1.plot(freq_plot, fmr1_plot, color=generate_pastel_colors(1)[0], 
                    linewidth=2, alpha=0.8, label='FFT → Uśrednianie')
            ax2.plot(freq_plot, fmr2_plot, color=generate_pastel_colors(1)[0], 
                    linewidth=2, alpha=0.8, label='Uśrednianie → FFT')
        
        # Formatowanie osi i etykiet
        for ax, title in zip([ax1, ax2], 
                           ['Metoda 1: FFT dla każdego punktu, następnie uśrednianie',
                            'Metoda 2: Uśrednianie przestrzenne, następnie FFT']):
            ax.set_xlabel('Częstotliwość [GHz]')
            ylabel = 'Amplituda FFT [znorm.]' if normalize else 'Amplituda FFT [a.u.]'
            ax.set_ylabel(ylabel)
            ax.set_title(title, fontweight='bold', pad=15)
            ax.grid(True, alpha=0.3)
            ax.legend(frameon=True, fancybox=True, shadow=True)
            
            if log_scale:
                ax.set_yscale('log')
            else:
                ax.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))
        
        # Dodanie informacji o parametrach
        info_text = f'Krok czasowy: {self.job.t_sampl:.2e} s\n'
        info_text += f'Rozdzielczość częstotliwościowa: {self.freq_ghz[1]:.3f} GHz\n'
        info_text += f'Liczba punktów czasowych: {self.m_z.shape[0]}\n'
        if freq_range:
            info_text += f'Zakres częstotliwości: {freq_range[0]:.1f} - {freq_range[1]:.1f} GHz'
        
        fig.text(0.02, 0.02, info_text, fontsize=8, 
                 bbox=dict(boxstyle="round,pad=0.3", facecolor="lightgray", alpha=0.7))
        
        plt.tight_layout()
        plt.subplots_adjust(top=0.92, bottom=0.12)
        
        if save_path:
            plt.savefig(save_path, dpi=dpi, bbox_inches='tight', 
                       facecolor='white', edgecolor='none')
            print(f"Wykres zapisany jako: {save_path}")
        
        plt.show()
        
        return fig, (ax1, ax2)

    def plot_comparison(self, save_path=None, dpi=300, freq_range=None, 
                       log_scale=False, normalize=False, show_difference=False):
        """
        Tworzy wykres porównawczy obu metod na jednym panelu
        
        Parameters:
        -----------
        save_path : str, optional
            Ścieżka do zapisania wykresu
        dpi : int
            Rozdzielczość wykresu
        freq_range : tuple, optional
            Zakres częstotliwości (min_freq, max_freq) w GHz
        log_scale : bool
            Czy użyć skali logarytmicznej dla osi Y
        normalize : bool
            Czy znormalizować spektra do maksimum
        show_difference : bool
            Czy pokazać różnicę między metodami
        """
        self._check_calculated()
        
        # Przygotowanie danych do wykresu
        fmr1 = self.fmr_method1.copy()
        fmr2 = self.fmr_method2.copy()
        
        if normalize:
            fmr1 = fmr1 / np.max(fmr1)
            fmr2 = fmr2 / np.max(fmr2)
        
        # Określenie zakresu częstotliwości
        if freq_range:
            mask = (self.freq_ghz >= freq_range[0]) & (self.freq_ghz <= freq_range[1])
            freq_plot = self.freq_ghz[mask]
            fmr1_plot = fmr1[mask]
            fmr2_plot = fmr2[mask]
        else:
            freq_plot = self.freq_ghz[1:]  # Pomijamy DC
            fmr1_plot = fmr1[1:]
            fmr2_plot = fmr2[1:]
        
        # Tworzenie wykresu
        if show_difference:
            fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 10))
        else:
            fig, ax1 = plt.subplots(figsize=(12, 8))
        
        # Wykresy obu metod
        ax1.plot(freq_plot, fmr1_plot, 'b-', linewidth=2.5, alpha=0.8,
                label='Metoda 1: FFT → Uśrednianie')
        ax1.plot(freq_plot, fmr2_plot, 'r--', linewidth=2.5, alpha=0.8,
                label='Metoda 2: Uśrednianie → FFT')
        
        ax1.set_xlabel('Częstotliwość [GHz]', fontweight='bold')
        ylabel = 'Amplituda FFT [znorm.]' if normalize else 'Amplituda FFT [a.u.]'
        ax1.set_ylabel(ylabel, fontweight='bold')
        ax1.set_title('Porównanie spektrów FMR - Dwie metody obliczania FFT', 
                     fontweight='bold', fontsize=16, pad=20)
        
        ax1.grid(True, alpha=0.3)
        ax1.legend(frameon=True, fancybox=True, shadow=True, loc='upper right')
        
        if log_scale:
            ax1.set_yscale('log')
        else:
            ax1.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))
        
        # Wykres różnicy (jeśli wymagany)
        if show_difference:
            difference = fmr1_plot - fmr2_plot
            ax2.plot(freq_plot, difference, 'g-', linewidth=2, alpha=0.8)
            ax2.set_xlabel('Częstotliwość [GHz]', fontweight='bold')
            ax2.set_ylabel('Różnica [Metoda 1 - Metoda 2]', fontweight='bold')
            ax2.set_title('Różnica między metodami', fontweight='bold', pad=15)
            ax2.grid(True, alpha=0.3)
            ax2.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))
        
        # Dodanie informacji
        info_text = f'Δt = {self.job.t_sampl:.2e} s | Δf = {self.freq_ghz[1]:.3f} GHz | N = {self.m_z.shape[0]} pts'
        if freq_range:
            info_text += f' | Zakres: {freq_range[0]:.1f}-{freq_range[1]:.1f} GHz'
        
        ax1.text(0.02, 0.98, info_text, transform=ax1.transAxes, fontsize=11,
                verticalalignment='top', 
                bbox=dict(boxstyle="round,pad=0.3", facecolor="white", alpha=0.8))
        
        plt.tight_layout()
        
        if save_path:
            plt.savefig(save_path, dpi=dpi, bbox_inches='tight')
            print(f"Wykres porównawczy zapisany jako: {save_path}")
        
        plt.show()
        
        return fig, ax1 if not show_difference else (fig, ax1, ax2)
    
    def get_peak_frequencies(self, method=1, prominence=0.1, freq_range=None):
        """
        Znajduje częstotliwości pików w spektrum
        
        Parameters:
        -----------
        method : int
            Która metoda (1 lub 2)
        prominence : float
            Minimalna prominencja piku
        freq_range : tuple, optional
            Zakres częstotliwości do analizy
            
        Returns:
        --------
        peaks_freq : array
            Częstotliwości pików w GHz
        peaks_amp : array
            Amplitudy pików
        """
        self._check_calculated()
        from scipy.signal import find_peaks
        
        fmr_data = self.fmr_method1 if method == 1 else self.fmr_method2
        
        if freq_range:
            mask = (self.freq_ghz >= freq_range[0]) & (self.freq_ghz <= freq_range[1])
            freq_search = self.freq_ghz[mask]
            fmr_search = fmr_data[mask]
        else:
            freq_search = self.freq_ghz[1:]  # Pomijamy DC
            fmr_search = fmr_data[1:]
        
        # Znajdź piki
        peaks, properties = find_peaks(fmr_search, prominence=prominence*np.max(fmr_search))
        
        peaks_freq = freq_search[peaks]
        peaks_amp = fmr_search[peaks]
        
        print(f"Znalezione piki (Metoda {method}):")
        for i, (freq, amp) in enumerate(zip(peaks_freq, peaks_amp)):
            print(f"  Pik {i+1}: {freq:.3f} GHz, amplituda: {amp:.2e}")
        
        return peaks_freq, peaks_amp
    
    def export_data(self, filename):
        """
        Eksportuje dane spektrum do pliku CSV
        """
        self._check_calculated()
        
        data_export = np.column_stack([
            self.freq_ghz,
            self.fmr_method1,
            self.fmr_method2
        ])
        
        header = "Frequency_GHz,FFT_then_Average,Average_then_FFT"
        np.savetxt(filename, data_export, delimiter=',', header=header, comments='')
        print(f"Dane wyeksportowane do: {filename}")

# Przykład użycia:
"""
# Inicjalizacja analizatora
analyzer = FMRAnalyzer(m_z, job)

# Obliczenie FFT (tylko raz!)
analyzer.calculate_fft_data()

# Różne wykresy bez ponownego obliczania FFT
analyzer.plot_spectrum(save_path='fmr_spectrum.png')
analyzer.plot_comparison(save_path='fmr_comparison.png')
analyzer.plot_comparison(freq_range=(0, 50), log_scale=True, normalize=True)
analyzer.plot_comparison(show_difference=True)

# Analiza pików
peaks_freq, peaks_amp = analyzer.get_peak_frequencies(method=1, prominence=0.1)

# Eksport danych
analyzer.export_data('fmr_data.csv')
"""]
                for i in range(3):
                    difference = fmr1_plot[:, i] - fmr2_plot[:, i]
                    ax2.plot(freq_plot, difference, color=colors_comp[i], 
                            linewidth=2, alpha=0.8, label=labels[i])
            else:
                difference = fmr1_plot - fmr2_plot
                ax2.plot(freq_plot, difference, color=generate_pastel_colors(1)[0], 
                        linewidth=2, alpha=0.8)
                
            ax2.set_xlabel('Częstotliwość [GHz]', fontweight='bold')
            ax2.set_ylabel('Różnica [Metoda 1 - Metoda 2]', fontweight='bold')
            ax2.set_title('Różnica między metodami', fontweight='bold', pad=15)
            ax2.grid(True, alpha=0.3)
            if has_components:
                ax2.legend(frameon=True, fancybox=True, shadow=True)
            ax2.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))
        
        # Dodanie informacji
        info_text = f'Δt = {self.job.t_sampl:.2e} s | Δf = {self.freq_ghz[1]:.3f} GHz | N = {self.m_z.shape[0]} pts'
        if freq_range:
            info_text += f' | Zakres: {freq_range[0]:.1f}-{freq_range[1]:.1f} GHz'
        
        ax1.text(0.02, 0.98, info_text, transform=ax1.transAxes, fontsize=9,
                verticalalignment='top', 
                bbox=dict(boxstyle="round,pad=0.3", facecolor="white", alpha=0.8))
        
        plt.tight_layout()
        
        if save_path:
            plt.savefig(save_path, dpi=dpi, bbox_inches='tight')
            print(f"Wykres porównawczy zapisany jako: {save_path}")
        
        plt.show()
        
        return fig, ax1 if not show_difference else (fig, ax1, ax2)
    
    def get_peak_frequencies(self, method=1, prominence=0.1, freq_range=None):
        """
        Znajduje częstotliwości pików w spektrum
        
        Parameters:
        -----------
        method : int
            Która metoda (1 lub 2)
        prominence : float
            Minimalna prominencja piku
        freq_range : tuple, optional
            Zakres częstotliwości do analizy
            
        Returns:
        --------
        peaks_freq : array
            Częstotliwości pików w GHz
        peaks_amp : array
            Amplitudy pików
        """
        self._check_calculated()
        from scipy.signal import find_peaks
        
        fmr_data = self.fmr_method1 if method == 1 else self.fmr_method2
        
        if freq_range:
            mask = (self.freq_ghz >= freq_range[0]) & (self.freq_ghz <= freq_range[1])
            freq_search = self.freq_ghz[mask]
            fmr_search = fmr_data[mask]
        else:
            freq_search = self.freq_ghz[1:]  # Pomijamy DC
            fmr_search = fmr_data[1:]
        
        # Znajdź piki
        peaks, properties = find_peaks(fmr_search, prominence=prominence*np.max(fmr_search))
        
        peaks_freq = freq_search[peaks]
        peaks_amp = fmr_search[peaks]
        
        print(f"Znalezione piki (Metoda {method}):")
        for i, (freq, amp) in enumerate(zip(peaks_freq, peaks_amp)):
            print(f"  Pik {i+1}: {freq:.3f} GHz, amplituda: {amp:.2e}")
        
        return peaks_freq, peaks_amp
    
    def export_data(self, filename):
        """
        Eksportuje dane spektrum do pliku CSV
        """
        self._check_calculated()
        
        data_export = np.column_stack([
            self.freq_ghz,
            self.fmr_method1,
            self.fmr_method2
        ])
        
        header = "Frequency_GHz,FFT_then_Average,Average_then_FFT"
        np.savetxt(filename, data_export, delimiter=',', header=header, comments='')
        print(f"Dane wyeksportowane do: {filename}")

# Przykład użycia:
"""
# Inicjalizacja analizatora
analyzer = FMRAnalyzer(m_z, job)

# Obliczenie FFT (tylko raz!)
analyzer.calculate_fft_data()

# Różne wykresy bez ponownego obliczania FFT
analyzer.plot_spectrum(save_path='fmr_spectrum.png')
analyzer.plot_comparison(save_path='fmr_comparison.png')
analyzer.plot_comparison(freq_range=(0, 50), log_scale=True, normalize=True)
analyzer.plot_comparison(show_difference=True)

# Analiza pików
peaks_freq, peaks_amp = analyzer.get_peak_frequencies(method=1, prominence=0.1)

# Eksport danych
analyzer.export_data('fmr_data.csv')
""", '$M_y

    def plot_comparison(self, save_path=None, dpi=300, freq_range=None, 
                       log_scale=False, normalize=False, show_difference=False):
        """
        Tworzy wykres porównawczy obu metod na jednym panelu
        
        Parameters:
        -----------
        save_path : str, optional
            Ścieżka do zapisania wykresu
        dpi : int
            Rozdzielczość wykresu
        freq_range : tuple, optional
            Zakres częstotliwości (min_freq, max_freq) w GHz
        log_scale : bool
            Czy użyć skali logarytmicznej dla osi Y
        normalize : bool
            Czy znormalizować spektra do maksimum
        show_difference : bool
            Czy pokazać różnicę między metodami
        """
        self._check_calculated()
        
        # Przygotowanie danych do wykresu
        fmr1 = self.fmr_method1.copy()
        fmr2 = self.fmr_method2.copy()
        
        if normalize:
            fmr1 = fmr1 / np.max(fmr1)
            fmr2 = fmr2 / np.max(fmr2)
        
        # Określenie zakresu częstotliwości
        if freq_range:
            mask = (self.freq_ghz >= freq_range[0]) & (self.freq_ghz <= freq_range[1])
            freq_plot = self.freq_ghz[mask]
            fmr1_plot = fmr1[mask]
            fmr2_plot = fmr2[mask]
        else:
            freq_plot = self.freq_ghz[1:]  # Pomijamy DC
            fmr1_plot = fmr1[1:]
            fmr2_plot = fmr2[1:]
        
        # Tworzenie wykresu
        if show_difference:
            fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 10))
        else:
            fig, ax1 = plt.subplots(figsize=(12, 8))
        
        # Wykresy obu metod
        ax1.plot(freq_plot, fmr1_plot, 'b-', linewidth=2.5, alpha=0.8,
                label='Metoda 1: FFT → Uśrednianie')
        ax1.plot(freq_plot, fmr2_plot, 'r--', linewidth=2.5, alpha=0.8,
                label='Metoda 2: Uśrednianie → FFT')
        
        ax1.set_xlabel('Częstotliwość [GHz]', fontweight='bold')
        ylabel = 'Amplituda FFT [znorm.]' if normalize else 'Amplituda FFT [a.u.]'
        ax1.set_ylabel(ylabel, fontweight='bold')
        ax1.set_title('Porównanie spektrów FMR - Dwie metody obliczania FFT', 
                     fontweight='bold', fontsize=16, pad=20)
        
        ax1.grid(True, alpha=0.3)
        ax1.legend(frameon=True, fancybox=True, shadow=True, loc='upper right')
        
        if log_scale:
            ax1.set_yscale('log')
        else:
            ax1.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))
        
        # Wykres różnicy (jeśli wymagany)
        if show_difference:
            difference = fmr1_plot - fmr2_plot
            ax2.plot(freq_plot, difference, 'g-', linewidth=2, alpha=0.8)
            ax2.set_xlabel('Częstotliwość [GHz]', fontweight='bold')
            ax2.set_ylabel('Różnica [Metoda 1 - Metoda 2]', fontweight='bold')
            ax2.set_title('Różnica między metodami', fontweight='bold', pad=15)
            ax2.grid(True, alpha=0.3)
            ax2.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))
        
        # Dodanie informacji
        info_text = f'Δt = {self.job.t_sampl:.2e} s | Δf = {self.freq_ghz[1]:.3f} GHz | N = {self.m_z.shape[0]} pts'
        if freq_range:
            info_text += f' | Zakres: {freq_range[0]:.1f}-{freq_range[1]:.1f} GHz'
        
        ax1.text(0.02, 0.98, info_text, transform=ax1.transAxes, fontsize=11,
                verticalalignment='top', 
                bbox=dict(boxstyle="round,pad=0.3", facecolor="white", alpha=0.8))
        
        plt.tight_layout()
        
        if save_path:
            plt.savefig(save_path, dpi=dpi, bbox_inches='tight')
            print(f"Wykres porównawczy zapisany jako: {save_path}")
        
        plt.show()
        
        return fig, ax1 if not show_difference else (fig, ax1, ax2)
    
    def get_peak_frequencies(self, method=1, prominence=0.1, freq_range=None):
        """
        Znajduje częstotliwości pików w spektrum
        
        Parameters:
        -----------
        method : int
            Która metoda (1 lub 2)
        prominence : float
            Minimalna prominencja piku
        freq_range : tuple, optional
            Zakres częstotliwości do analizy
            
        Returns:
        --------
        peaks_freq : array
            Częstotliwości pików w GHz
        peaks_amp : array
            Amplitudy pików
        """
        self._check_calculated()
        from scipy.signal import find_peaks
        
        fmr_data = self.fmr_method1 if method == 1 else self.fmr_method2
        
        if freq_range:
            mask = (self.freq_ghz >= freq_range[0]) & (self.freq_ghz <= freq_range[1])
            freq_search = self.freq_ghz[mask]
            fmr_search = fmr_data[mask]
        else:
            freq_search = self.freq_ghz[1:]  # Pomijamy DC
            fmr_search = fmr_data[1:]
        
        # Znajdź piki
        peaks, properties = find_peaks(fmr_search, prominence=prominence*np.max(fmr_search))
        
        peaks_freq = freq_search[peaks]
        peaks_amp = fmr_search[peaks]
        
        print(f"Znalezione piki (Metoda {method}):")
        for i, (freq, amp) in enumerate(zip(peaks_freq, peaks_amp)):
            print(f"  Pik {i+1}: {freq:.3f} GHz, amplituda: {amp:.2e}")
        
        return peaks_freq, peaks_amp
    
    def export_data(self, filename):
        """
        Eksportuje dane spektrum do pliku CSV
        """
        self._check_calculated()
        
        data_export = np.column_stack([
            self.freq_ghz,
            self.fmr_method1,
            self.fmr_method2
        ])
        
        header = "Frequency_GHz,FFT_then_Average,Average_then_FFT"
        np.savetxt(filename, data_export, delimiter=',', header=header, comments='')
        print(f"Dane wyeksportowane do: {filename}")

# Przykład użycia:
"""
# Inicjalizacja analizatora
analyzer = FMRAnalyzer(m_z, job)

# Obliczenie FFT (tylko raz!)
analyzer.calculate_fft_data()

# Różne wykresy bez ponownego obliczania FFT
analyzer.plot_spectrum(save_path='fmr_spectrum.png')
analyzer.plot_comparison(save_path='fmr_comparison.png')
analyzer.plot_comparison(freq_range=(0, 50), log_scale=True, normalize=True)
analyzer.plot_comparison(show_difference=True)

# Analiza pików
peaks_freq, peaks_amp = analyzer.get_peak_frequencies(method=1, prominence=0.1)

# Eksport danych
analyzer.export_data('fmr_data.csv')
""", '$M_z

    def plot_comparison(self, save_path=None, dpi=300, freq_range=None, 
                       log_scale=False, normalize=False, show_difference=False):
        """
        Tworzy wykres porównawczy obu metod na jednym panelu
        
        Parameters:
        -----------
        save_path : str, optional
            Ścieżka do zapisania wykresu
        dpi : int
            Rozdzielczość wykresu
        freq_range : tuple, optional
            Zakres częstotliwości (min_freq, max_freq) w GHz
        log_scale : bool
            Czy użyć skali logarytmicznej dla osi Y
        normalize : bool
            Czy znormalizować spektra do maksimum
        show_difference : bool
            Czy pokazać różnicę między metodami
        """
        self._check_calculated()
        
        # Przygotowanie danych do wykresu
        fmr1 = self.fmr_method1.copy()
        fmr2 = self.fmr_method2.copy()
        
        if normalize:
            fmr1 = fmr1 / np.max(fmr1)
            fmr2 = fmr2 / np.max(fmr2)
        
        # Określenie zakresu częstotliwości
        if freq_range:
            mask = (self.freq_ghz >= freq_range[0]) & (self.freq_ghz <= freq_range[1])
            freq_plot = self.freq_ghz[mask]
            fmr1_plot = fmr1[mask]
            fmr2_plot = fmr2[mask]
        else:
            freq_plot = self.freq_ghz[1:]  # Pomijamy DC
            fmr1_plot = fmr1[1:]
            fmr2_plot = fmr2[1:]
        
        # Tworzenie wykresu
        if show_difference:
            fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 10))
        else:
            fig, ax1 = plt.subplots(figsize=(12, 8))
        
        # Wykresy obu metod
        ax1.plot(freq_plot, fmr1_plot, 'b-', linewidth=2.5, alpha=0.8,
                label='Metoda 1: FFT → Uśrednianie')
        ax1.plot(freq_plot, fmr2_plot, 'r--', linewidth=2.5, alpha=0.8,
                label='Metoda 2: Uśrednianie → FFT')
        
        ax1.set_xlabel('Częstotliwość [GHz]', fontweight='bold')
        ylabel = 'Amplituda FFT [znorm.]' if normalize else 'Amplituda FFT [a.u.]'
        ax1.set_ylabel(ylabel, fontweight='bold')
        ax1.set_title('Porównanie spektrów FMR - Dwie metody obliczania FFT', 
                     fontweight='bold', fontsize=16, pad=20)
        
        ax1.grid(True, alpha=0.3)
        ax1.legend(frameon=True, fancybox=True, shadow=True, loc='upper right')
        
        if log_scale:
            ax1.set_yscale('log')
        else:
            ax1.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))
        
        # Wykres różnicy (jeśli wymagany)
        if show_difference:
            difference = fmr1_plot - fmr2_plot
            ax2.plot(freq_plot, difference, 'g-', linewidth=2, alpha=0.8)
            ax2.set_xlabel('Częstotliwość [GHz]', fontweight='bold')
            ax2.set_ylabel('Różnica [Metoda 1 - Metoda 2]', fontweight='bold')
            ax2.set_title('Różnica między metodami', fontweight='bold', pad=15)
            ax2.grid(True, alpha=0.3)
            ax2.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))
        
        # Dodanie informacji
        info_text = f'Δt = {self.job.t_sampl:.2e} s | Δf = {self.freq_ghz[1]:.3f} GHz | N = {self.m_z.shape[0]} pts'
        if freq_range:
            info_text += f' | Zakres: {freq_range[0]:.1f}-{freq_range[1]:.1f} GHz'
        
        ax1.text(0.02, 0.98, info_text, transform=ax1.transAxes, fontsize=11,
                verticalalignment='top', 
                bbox=dict(boxstyle="round,pad=0.3", facecolor="white", alpha=0.8))
        
        plt.tight_layout()
        
        if save_path:
            plt.savefig(save_path, dpi=dpi, bbox_inches='tight')
            print(f"Wykres porównawczy zapisany jako: {save_path}")
        
        plt.show()
        
        return fig, ax1 if not show_difference else (fig, ax1, ax2)
    
    def get_peak_frequencies(self, method=1, prominence=0.1, freq_range=None):
        """
        Znajduje częstotliwości pików w spektrum
        
        Parameters:
        -----------
        method : int
            Która metoda (1 lub 2)
        prominence : float
            Minimalna prominencja piku
        freq_range : tuple, optional
            Zakres częstotliwości do analizy
            
        Returns:
        --------
        peaks_freq : array
            Częstotliwości pików w GHz
        peaks_amp : array
            Amplitudy pików
        """
        self._check_calculated()
        from scipy.signal import find_peaks
        
        fmr_data = self.fmr_method1 if method == 1 else self.fmr_method2
        
        if freq_range:
            mask = (self.freq_ghz >= freq_range[0]) & (self.freq_ghz <= freq_range[1])
            freq_search = self.freq_ghz[mask]
            fmr_search = fmr_data[mask]
        else:
            freq_search = self.freq_ghz[1:]  # Pomijamy DC
            fmr_search = fmr_data[1:]
        
        # Znajdź piki
        peaks, properties = find_peaks(fmr_search, prominence=prominence*np.max(fmr_search))
        
        peaks_freq = freq_search[peaks]
        peaks_amp = fmr_search[peaks]
        
        print(f"Znalezione piki (Metoda {method}):")
        for i, (freq, amp) in enumerate(zip(peaks_freq, peaks_amp)):
            print(f"  Pik {i+1}: {freq:.3f} GHz, amplituda: {amp:.2e}")
        
        return peaks_freq, peaks_amp
    
    def export_data(self, filename):
        """
        Eksportuje dane spektrum do pliku CSV
        """
        self._check_calculated()
        
        data_export = np.column_stack([
            self.freq_ghz,
            self.fmr_method1,
            self.fmr_method2
        ])
        
        header = "Frequency_GHz,FFT_then_Average,Average_then_FFT"
        np.savetxt(filename, data_export, delimiter=',', header=header, comments='')
        print(f"Dane wyeksportowane do: {filename}")

# Przykład użycia:
"""
# Inicjalizacja analizatora
analyzer = FMRAnalyzer(m_z, job)

# Obliczenie FFT (tylko raz!)
analyzer.calculate_fft_data()

# Różne wykresy bez ponownego obliczania FFT
analyzer.plot_spectrum(save_path='fmr_spectrum.png')
analyzer.plot_comparison(save_path='fmr_comparison.png')
analyzer.plot_comparison(freq_range=(0, 50), log_scale=True, normalize=True)
analyzer.plot_comparison(show_difference=True)

# Analiza pików
peaks_freq, peaks_amp = analyzer.get_peak_frequencies(method=1, prominence=0.1)

# Eksport danych
analyzer.export_data('fmr_data.csv')
"""]
            
            # Wykres 1: Metoda 1
            for i in range(3):
                data_plot = fmr1_plot[:, i] if has_components else fmr1_plot
                ax1.plot(freq_plot, data_plot, color=colors_comp[i], 
                        linewidth=2, alpha=0.8, label=labels[i])
                
            # Wykres 2: Metoda 2  
            for i in range(3):
                data_plot = fmr2_plot[:, i] if has_components else fmr2_plot
                ax2.plot(freq_plot, data_plot, color=colors_comp[i], 
                        linewidth=2, alpha=0.8, label=labels[i])
        else:
            # Pojedyncze krzywe
            ax1.plot(freq_plot, fmr1_plot, color=generate_pastel_colors(1)[0], 
                    linewidth=2, alpha=0.8, label='FFT → Uśrednianie')
            ax2.plot(freq_plot, fmr2_plot, color=generate_pastel_colors(1)[0], 
                    linewidth=2, alpha=0.8, label='Uśrednianie → FFT')
        
        # Formatowanie osi i etykiet
        for ax, title in zip([ax1, ax2], 
                           ['Metoda 1: FFT dla każdego punktu, następnie uśrednianie',
                            'Metoda 2: Uśrednianie przestrzenne, następnie FFT']):
            ax.set_xlabel('Częstotliwość [GHz]')
            ylabel = 'Amplituda FFT [znorm.]' if normalize else 'Amplituda FFT [a.u.]'
            ax.set_ylabel(ylabel)
            ax.set_title(title, fontweight='bold', pad=15)
            ax.grid(True, alpha=0.3)
            ax.legend(frameon=True, fancybox=True, shadow=True)
            
            if log_scale:
                ax.set_yscale('log')
            else:
                ax.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))
        
        # Dodanie informacji o parametrach
        info_text = f'Krok czasowy: {self.job.t_sampl:.2e} s\n'
        info_text += f'Rozdzielczość częstotliwościowa: {self.freq_ghz[1]:.3f} GHz\n'
        info_text += f'Liczba punktów czasowych: {self.m_z.shape[0]}\n'
        if freq_range:
            info_text += f'Zakres częstotliwości: {freq_range[0]:.1f} - {freq_range[1]:.1f} GHz'
        
        fig.text(0.02, 0.02, info_text, fontsize=8, 
                 bbox=dict(boxstyle="round,pad=0.3", facecolor="lightgray", alpha=0.7))
        
        plt.tight_layout()
        plt.subplots_adjust(top=0.92, bottom=0.12)
        
        if save_path:
            plt.savefig(save_path, dpi=dpi, bbox_inches='tight', 
                       facecolor='white', edgecolor='none')
            print(f"Wykres zapisany jako: {save_path}")
        
        plt.show()
        
        return fig, (ax1, ax2)

    def plot_comparison(self, save_path=None, dpi=300, freq_range=None, 
                       log_scale=False, normalize=False, show_difference=False):
        """
        Tworzy wykres porównawczy obu metod na jednym panelu
        
        Parameters:
        -----------
        save_path : str, optional
            Ścieżka do zapisania wykresu
        dpi : int
            Rozdzielczość wykresu
        freq_range : tuple, optional
            Zakres częstotliwości (min_freq, max_freq) w GHz
        log_scale : bool
            Czy użyć skali logarytmicznej dla osi Y
        normalize : bool
            Czy znormalizować spektra do maksimum
        show_difference : bool
            Czy pokazać różnicę między metodami
        """
        self._check_calculated()
        
        # Przygotowanie danych do wykresu
        fmr1 = self.fmr_method1.copy()
        fmr2 = self.fmr_method2.copy()
        
        if normalize:
            fmr1 = fmr1 / np.max(fmr1)
            fmr2 = fmr2 / np.max(fmr2)
        
        # Określenie zakresu częstotliwości
        if freq_range:
            mask = (self.freq_ghz >= freq_range[0]) & (self.freq_ghz <= freq_range[1])
            freq_plot = self.freq_ghz[mask]
            fmr1_plot = fmr1[mask]
            fmr2_plot = fmr2[mask]
        else:
            freq_plot = self.freq_ghz[1:]  # Pomijamy DC
            fmr1_plot = fmr1[1:]
            fmr2_plot = fmr2[1:]
        
        # Tworzenie wykresu
        if show_difference:
            fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 10))
        else:
            fig, ax1 = plt.subplots(figsize=(12, 8))
        
        # Wykresy obu metod
        ax1.plot(freq_plot, fmr1_plot, 'b-', linewidth=2.5, alpha=0.8,
                label='Metoda 1: FFT → Uśrednianie')
        ax1.plot(freq_plot, fmr2_plot, 'r--', linewidth=2.5, alpha=0.8,
                label='Metoda 2: Uśrednianie → FFT')
        
        ax1.set_xlabel('Częstotliwość [GHz]', fontweight='bold')
        ylabel = 'Amplituda FFT [znorm.]' if normalize else 'Amplituda FFT [a.u.]'
        ax1.set_ylabel(ylabel, fontweight='bold')
        ax1.set_title('Porównanie spektrów FMR - Dwie metody obliczania FFT', 
                     fontweight='bold', fontsize=16, pad=20)
        
        ax1.grid(True, alpha=0.3)
        ax1.legend(frameon=True, fancybox=True, shadow=True, loc='upper right')
        
        if log_scale:
            ax1.set_yscale('log')
        else:
            ax1.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))
        
        # Wykres różnicy (jeśli wymagany)
        if show_difference:
            difference = fmr1_plot - fmr2_plot
            ax2.plot(freq_plot, difference, 'g-', linewidth=2, alpha=0.8)
            ax2.set_xlabel('Częstotliwość [GHz]', fontweight='bold')
            ax2.set_ylabel('Różnica [Metoda 1 - Metoda 2]', fontweight='bold')
            ax2.set_title('Różnica między metodami', fontweight='bold', pad=15)
            ax2.grid(True, alpha=0.3)
            ax2.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))
        
        # Dodanie informacji
        info_text = f'Δt = {self.job.t_sampl:.2e} s | Δf = {self.freq_ghz[1]:.3f} GHz | N = {self.m_z.shape[0]} pts'
        if freq_range:
            info_text += f' | Zakres: {freq_range[0]:.1f}-{freq_range[1]:.1f} GHz'
        
        ax1.text(0.02, 0.98, info_text, transform=ax1.transAxes, fontsize=11,
                verticalalignment='top', 
                bbox=dict(boxstyle="round,pad=0.3", facecolor="white", alpha=0.8))
        
        plt.tight_layout()
        
        if save_path:
            plt.savefig(save_path, dpi=dpi, bbox_inches='tight')
            print(f"Wykres porównawczy zapisany jako: {save_path}")
        
        plt.show()
        
        return fig, ax1 if not show_difference else (fig, ax1, ax2)
    
    def get_peak_frequencies(self, method=1, prominence=0.1, freq_range=None):
        """
        Znajduje częstotliwości pików w spektrum
        
        Parameters:
        -----------
        method : int
            Która metoda (1 lub 2)
        prominence : float
            Minimalna prominencja piku
        freq_range : tuple, optional
            Zakres częstotliwości do analizy
            
        Returns:
        --------
        peaks_freq : array
            Częstotliwości pików w GHz
        peaks_amp : array
            Amplitudy pików
        """
        self._check_calculated()
        from scipy.signal import find_peaks
        
        fmr_data = self.fmr_method1 if method == 1 else self.fmr_method2
        
        if freq_range:
            mask = (self.freq_ghz >= freq_range[0]) & (self.freq_ghz <= freq_range[1])
            freq_search = self.freq_ghz[mask]
            fmr_search = fmr_data[mask]
        else:
            freq_search = self.freq_ghz[1:]  # Pomijamy DC
            fmr_search = fmr_data[1:]
        
        # Znajdź piki
        peaks, properties = find_peaks(fmr_search, prominence=prominence*np.max(fmr_search))
        
        peaks_freq = freq_search[peaks]
        peaks_amp = fmr_search[peaks]
        
        print(f"Znalezione piki (Metoda {method}):")
        for i, (freq, amp) in enumerate(zip(peaks_freq, peaks_amp)):
            print(f"  Pik {i+1}: {freq:.3f} GHz, amplituda: {amp:.2e}")
        
        return peaks_freq, peaks_amp
    
    def export_data(self, filename):
        """
        Eksportuje dane spektrum do pliku CSV
        """
        self._check_calculated()
        
        data_export = np.column_stack([
            self.freq_ghz,
            self.fmr_method1,
            self.fmr_method2
        ])
        
        header = "Frequency_GHz,FFT_then_Average,Average_then_FFT"
        np.savetxt(filename, data_export, delimiter=',', header=header, comments='')
        print(f"Dane wyeksportowane do: {filename}")

# Inicjalizacja analizatora
analyzer = FMRAnalyzer(m_z, job)

# Obliczenie FFT (tylko raz!)
analyzer.calculate_fft_data()

# Różne wykresy bez ponownego obliczania FFT
analyzer.plot_spectrum(save_path='fmr_spectrum.png')
analyzer.plot_comparison(save_path='fmr_comparison.png')
analyzer.plot_comparison(freq_range=(0, 50), log_scale=True, normalize=True)
analyzer.plot_comparison(show_difference=True)

# Analiza pików
peaks_freq, peaks_amp = analyzer.get_peak_frequencies(method=1, prominence=0.1)

